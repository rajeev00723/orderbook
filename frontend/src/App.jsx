import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend, LabelList, PieChart, Pie, Cell 
} from 'recharts';
import { 
  CheckSquare, Square, Upload, Calendar, Layers, BarChart3, 
  Loader2, Info, Search, Box, MousePointer2, TrendingUp, TrendingDown,
  AlertTriangle, ChevronUp, ChevronDown, Copy, Check, Mail, Tags 
} from 'lucide-react';

// --- CUSTOM LABEL RENDERER (On-Chart Values) ---
const RenderActiveValueLabel = (props) => {
  const { x, y, value, index, activeIndex } = props;
  if (activeIndex === null || activeIndex === undefined || index !== activeIndex) return null;
  if (!value || value === 0) return null;
  return (
    <g>
      <rect x={x - 30} y={y - 28} width={60} height={20} rx={6} fill="#1D1D1B" />
      <path d={`M${x-4},${y-8} L${x+4},${y-8} L${x},${y-2} Z`} fill="#1D1D1B" />
      <text x={x} y={y - 14} fill="#FFCC00" textAnchor="middle" fontSize={10} fontWeight="900">
        €{Math.round(value).toLocaleString()}
      </text>
    </g>
  );
};

const App = () => {
  // --- STATE MANAGEMENT ---
  const [reportDates, setReportDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [data, setData] = useState({ 
    orders: [], 
    unifiedChartData: [], 
    towerStats: [],
    wowTotalDelta: 0, 
    audit: { ghostCount: 0, ghostCost: 0 } 
  });
  
  // Interaction & UI State
  const [activeMonthIndex, setActiveMonthIndex] = useState(null);
  const [focusItem, setFocusItem] = useState(null); 
  const [viewMode, setViewMode] = useState('individual'); // 'individual', 'grouped', 'cumulative'
  const [sortConfig, setSortConfig] = useState({ key: 'Full This Year Projection', direction: 'desc' });
  const [searchTerm, setSearchTerm] = useState("");
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const fileInputRef = useRef(null);

  // --- CONFIGURATION ---
  const API_BASE = "http://localhost:8009/api";
  const CHART_COLORS = ["#D40511", "#10b981", "#FFCC00", "#475569", "#8b5cf6", "#0ea5e9", "#ef4444", "#fb923c"];
  const TOWER_COLORS = ['#334155', '#D40511', '#FFCC00', '#64748b', '#94a3b8'];
  const monthKeys = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];

  // --- TAGGING ENGINE ---
  const getProductTag = (name) => {
    if (!name) return "OTHER";
    const n = name.toUpperCase();
    if (n.includes('CSV')) return 'CSV SERVICES';
    if (n.includes('CSLITE')) return 'CSLITE SERVICES';
    if (n.includes('B2D')) return 'B2D PLATFORM';
    if (n.includes('GXS')) return 'GXS GATEWAY';
    return 'STANDALONE';
  };

  // --- API DATA LOADERS ---
  useEffect(() => {
    const init = async () => {
      try {
        const res = await axios.get(`${API_BASE}/report-dates`);
        if (res.data && res.data.length > 0) {
          setReportDates(res.data);
          setSelectedDate(res.data[0]);
        }
      } catch (err) { console.error("Initial Sync Error", err); }
      finally { setIsInitialLoading(false); }
    };
    init();
  }, []);

  useEffect(() => { 
    if (selectedDate) {
      axios.get(`${API_BASE}/products?report_date=${selectedDate}`).then(res => setProducts(res.data || []));
    }
  }, [selectedDate]);

  useEffect(() => {
    if (selectedProducts.length > 0 && selectedDate) {
      const params = new URLSearchParams();
      params.append('report_date', selectedDate);
      selectedProducts.forEach(p => params.append('product_names', p));
      
      axios.get(`${API_BASE}/summary?${params.toString()}`).then(res => {
        if (!res.data) return;
        
        // 1. Unified Timeline Data Processing
        const months = monthKeys.map((m, idx) => {
            const entry = { month: m, index: idx };
            let monthTotal = 0;
            const groupTotals = {};

            (res.data.individualTrends || []).forEach(t => {
                const mData = t.data?.find(d => d.month === m);
                const cost = mData?.cost || 0;
                const tag = getProductTag(t.name);
                
                entry[t.name] = cost;
                entry[`${t.name}_breakdown`] = mData?.breakdown || [];

                groupTotals[tag] = (groupTotals[tag] || 0) + cost;
                entry[`${tag}_breakdown`] = (entry[`${tag}_breakdown`] || []).concat(mData?.breakdown || []);
                
                monthTotal += cost;
            });

            Object.keys(groupTotals).forEach(tag => { entry[tag] = groupTotals[tag]; });
            entry.cumulativeTotal = monthTotal;
            return entry;
        });

        // 2. Pre-calculate Stats for the Matrix (Min, Max, Avg)
        const processedOrders = (res.data.orders || []).map(o => {
            const vals = monthKeys.map(m => o[m] || 0);
            return { 
                ...o, 
                tag: getProductTag(o['Order Description']),
                _min: Math.min(...vals), 
                _max: Math.max(...vals), 
                _avg: vals.reduce((a, b) => a + b, 0) / 12 
            };
        });

        setData({ 
            orders: processedOrders, 
            unifiedChartData: months, 
            towerStats: res.data.towerStats || [],
            wowTotalDelta: res.data.wowTotalDelta || 0, 
            audit: res.data.audit || { ghostCount: 0, ghostCost: 0 } 
        });
        
        if (!focusItem) setFocusItem(selectedProducts[0]);
      });
    }
  }, [selectedProducts, selectedDate]);

  // --- TABLE LOGIC: GROUPING & SORTING ---
  const matrixData = useMemo(() => {
    if (viewMode !== 'grouped') return data.orders;
    const groups = {};
    data.orders.forEach(o => {
        const tag = o.tag;
        if (!groups[tag]) {
            groups[tag] = { 
                'Order Description': tag, 
                'Full This Year Projection': 0, 
                wow_delta: 0, _min: 0, _max: 0, _avg: 0, isGroup: true 
            };
        }
        groups[tag]['Full This Year Projection'] += o['Full This Year Projection'];
        groups[tag].wow_delta += o.wow_delta;
        groups[tag]._min += o._min;
        groups[tag]._max += o._max;
        groups[tag]._avg += o._avg;
    });
    return Object.values(groups);
  }, [data.orders, viewMode]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const sortedOrders = useMemo(() => {
    let items = [...matrixData];
    if (sortConfig) {
      items.sort((a, b) => {
        let aV = a[sortConfig.key]; let bV = b[sortConfig.key];
        if (typeof aV === 'string') return sortConfig.direction === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV);
        return sortConfig.direction === 'asc' ? aV - bV : bV - aV;
      });
    }
    return items;
  }, [matrixData, sortConfig]);

  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) return <div className="w-3" />;
    return sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-[#D40511]" /> : <ChevronDown size={12} className="text-[#D40511]" />;
  };

  // --- ACTIONS: COPY & EMAIL ---
  const generateSnippetText = () => {
    const monthName = activeMonthIndex !== null ? monthKeys[activeMonthIndex] : "ANNUAL";
    const currentTotal = activeBreakdown.reduce((acc, curr) => acc + (curr.cost || 0), 0);
    let txt = `DHL FINANCE REPORT [${selectedDate}]\nFOCUS: ${focusItem?.toUpperCase()}\nPERIOD: ${monthName.toUpperCase()} 2025\nTOTAL: €${currentTotal.toLocaleString()}\n\nDETAILED BREAKDOWN:\n`;
    activeBreakdown.slice(0, 20).forEach(item => {
      txt += `  - ${item.material}: €${item.cost.toLocaleString()}\n`;
    });
    return txt;
  };

  const handleCopy = () => {
    if (!focusItem) return;
    navigator.clipboard.writeText(generateSnippetText());
    setIsCopying(true); setTimeout(() => setIsCopying(false), 2000);
  };

  const handleEmail = () => {
    if (!focusItem) return;
    const body = encodeURIComponent(generateSnippetText());
    const subject = encodeURIComponent(`Financial Performance Breakdown: ${focusItem}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  // --- HANDLERS: UPLOAD ---
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const fd = new FormData(); fd.append('file', file);
    try {
      await axios.post(`${API_BASE}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      window.location.reload();
    } catch (err) { alert("Upload Failed"); setIsUploading(false); }
  };

  const safeUnifiedData = data.unifiedChartData || [];
  const currentMonthData = activeMonthIndex !== null ? (safeUnifiedData[activeMonthIndex] || {}) : {};
  const activeBreakdown = focusItem ? (currentMonthData[`${focusItem}_breakdown`] || []) : [];

  if (isInitialLoading) return <div className="h-screen w-screen bg-[#1D1D1B] flex items-center justify-center text-white font-black italic">SYNCING DHL DATA...</div>;

  return (
    <div className="h-screen w-screen bg-[#F0F0F0] flex flex-col overflow-hidden font-sans text-[#1D1D1B] select-none">
      
      {/* HEADER */}
      <header className="bg-[#D40511] h-14 flex items-center justify-between px-6 shrink-0 border-b-4 border-[#FFCC00] z-30 shadow-xl">
        <div className="text-white font-black italic text-xl tracking-tighter uppercase">
          DHL <span className="font-light not-italic text-xs ml-2 opacity-80 border-l pl-3 border-white/20 tracking-widest">Finance Command</span>
        </div>
        <div className="flex items-center gap-4">
            <div className="bg-black/20 text-white px-3 py-1 rounded-lg flex items-center gap-2 text-[10px] border border-white/10">
                <Calendar size={12} className="text-[#FFCC00]"/>
                <select value={selectedDate} onChange={(e)=>setSelectedDate(e.target.value)} className="bg-transparent font-bold outline-none cursor-pointer">
                    {reportDates.map(d => <option key={d} value={d} className="text-black font-bold">{d}</option>)}
                </select>
            </div>
            <button onClick={() => fileInputRef.current?.click()} className="bg-[#FFCC00] hover:scale-105 text-black px-4 py-1.5 rounded-lg font-black text-[10px] flex items-center gap-2 transition-all uppercase shadow-lg">
                {isUploading ? <Loader2 className="animate-spin" size={12}/> : <Upload size={12}/>} Sync Report
            </button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleUpload} accept=".xlsx" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        {/* SIDEBAR */}
        <aside className="w-64 bg-white border-r flex flex-col shrink-0 shadow-sm z-10">
          <div className="p-4 border-b bg-gray-50/50">
             <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Service Pool</h3>
             <div className="relative">
                <Search className="absolute left-2.5 top-2.5 text-gray-300" size={12}/>
                <input type="text" placeholder="Search..." className="w-full bg-white border border-gray-200 rounded-lg py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-[#D40511]" onChange={(e) => setSearchTerm(e.target.value)}/>
             </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {(products || []).filter(p => p.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
              <div key={p} onClick={() => setSelectedProducts(prev => prev.includes(p) ? prev.filter(i => i !== p) : [...prev, p])} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer text-[10px] font-bold transition-all border mb-1 ${selectedProducts.includes(p) ? 'bg-red-50 border-red-100 text-[#D40511]' : 'border-transparent hover:bg-gray-50 text-gray-500'}`}>
                {selectedProducts.includes(p) ? <CheckSquare size={14} className="fill-[#D40511] text-white"/> : <Square size={14} className="text-gray-200"/>}
                <span className="truncate uppercase">{p}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN HUB */}
        <main className="flex-1 flex flex-col overflow-hidden p-6 gap-6">
          <div className="flex justify-between items-center shrink-0 px-2">
             <h2 className="text-2xl font-black tracking-tighter uppercase">Aggregated Market Analysis</h2>
             <div className="flex bg-white rounded-xl p-1 shadow-sm border border-gray-200">
                <button onClick={() => setViewMode('individual')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-2 transition-all ${viewMode === 'individual' ? 'bg-[#D40511] text-white shadow-md' : 'text-gray-400'}`}><Layers size={12}/> Individual</button>
                <button onClick={() => setViewMode('grouped')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-2 transition-all ${viewMode === 'grouped' ? 'bg-[#10b981] text-white shadow-md' : 'text-gray-400'}`}><Tags size={12}/> Grouped</button>
                <button onClick={() => setViewMode('cumulative')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-2 transition-all ${viewMode === 'cumulative' ? 'bg-[#1D1D1B] text-white shadow-md' : 'text-gray-400'}`}><BarChart3 size={12}/> Total</button>
             </div>
          </div>

          <div className="flex-1 flex gap-6 overflow-hidden">
             {/* THE TREND CHART */}
             <div className="flex-[3] bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden relative">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.unifiedChartData} onMouseMove={(e) => { if (e && e.activeTooltipIndex !== undefined) setActiveMonthIndex(e.activeTooltipIndex); }} onMouseLeave={() => setActiveMonthIndex(null)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{fontSize:10, fontWeight:900}} axisLine={false} />
                    <YAxis tick={{fontSize:10, fontWeight:900}} axisLine={false} />
                    <Tooltip content={<div className="hidden"/>} cursor={{ stroke: "#D40511", strokeWidth: 2 }} />
                    
                    {viewMode === 'individual' ? selectedProducts.map((p, i) => (
                      <Area key={p} type="monotone" dataKey={p} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={focusItem === p ? 0.15 : 0.01} strokeWidth={focusItem === p ? 5 : 2} onMouseEnter={() => setFocusItem(p)} activeDot={{ r: 6 }}>
                        <LabelList content={<RenderActiveValueLabel activeIndex={activeMonthIndex} />} />
                      </Area>
                    )) : viewMode === 'grouped' ? [...new Set(selectedProducts.map(getProductTag))].map((tag, i) => (
                      <Area key={tag} type="monotone" dataKey={tag} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={focusItem === tag ? 0.15 : 0.01} strokeWidth={focusItem === tag ? 5 : 2} onMouseEnter={() => setFocusItem(tag)} activeDot={{ r: 6 }}>
                        <LabelList content={<RenderActiveValueLabel activeIndex={activeMonthIndex} />} />
                      </Area>
                    )) : <Area dataKey="cumulativeTotal" type="monotone" name="Total" stroke="#D40511" fill="#D40511" fillOpacity={0.1} strokeWidth={5}><LabelList content={<RenderActiveValueLabel activeIndex={activeMonthIndex} />} /></Area>}
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </AreaChart>
               </ResponsiveContainer>
             </div>

             {/* THE TOWER PIE */}
             <div className="flex-1 bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col overflow-hidden">
                <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4">Tower Density</h3>
                <div className="flex-1">
                   <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                         <Pie data={data.towerStats} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                            {data.towerStats.map((entry, index) => <Cell key={`cell-${index}`} fill={TOWER_COLORS[index % TOWER_COLORS.length]} />)}
                         </Pie>
                         <Tooltip formatter={(v) => `€${Math.round(v).toLocaleString()}`}/>
                      </PieChart>
                   </ResponsiveContainer>
                </div>
             </div>
          </div>

          {/* THE MATRIX - ENHANCED WITH SORTING & AVG */}
          <div className="h-1/3 bg-white rounded-[2rem] border shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-3 border-b bg-gray-50/50 flex justify-between items-center text-[9px] font-black text-gray-400 uppercase tracking-widest italic">
                <span>Projection Matrix [Click Headers to Sort]</span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left">
                      <thead className="bg-white text-[8px] font-black text-gray-300 uppercase sticky top-0 border-b z-20">
                          <tr>
                            <th onClick={() => requestSort('Order Description')} className="px-8 py-3 cursor-pointer hover:text-[#D40511] transition-all">
                              <div className="flex items-center gap-1">Focus Target {renderSortIcon('Order Description')}</div>
                            </th>
                            <th onClick={() => requestSort('_min')} className="px-6 py-3 text-right cursor-pointer hover:text-[#D40511]">
                              <div className="flex items-center justify-end gap-1">Min {renderSortIcon('_min')}</div>
                            </th>
                            <th onClick={() => requestSort('_max')} className="px-6 py-3 text-right cursor-pointer hover:text-[#D40511]">
                              <div className="flex items-center justify-end gap-1">Max {renderSortIcon('_max')}</div>
                            </th>
                            <th onClick={() => requestSort('_avg')} className="px-6 py-3 text-right cursor-pointer hover:text-[#D40511]">
                              <div className="flex items-center justify-end gap-1">Avg {renderSortIcon('_avg')}</div>
                            </th>
                            <th onClick={() => requestSort('Full This Year Projection')} className="px-8 py-3 text-right cursor-pointer hover:text-[#D40511]">
                              <div className="flex items-center justify-end gap-1">FY € {renderSortIcon('Full This Year Projection')}</div>
                            </th>
                            <th onClick={() => requestSort('wow_delta')} className="px-8 py-3 text-right cursor-pointer hover:text-[#D40511]">
                              <div className="flex items-center justify-end gap-1">Weekly Δ {renderSortIcon('wow_delta')}</div>
                            </th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-[10px] font-black">
                          {sortedOrders.map((o, i) => (
                              <tr key={i} onMouseEnter={() => setFocusItem(o['Order Description'])} className={`hover:bg-red-50/50 transition-all ${focusItem === o['Order Description'] ? 'bg-red-50/70 border-l-4 border-[#D40511]' : ''}`}>
                                  <td className="px-8 py-4 uppercase flex items-center gap-2">{o.isGroup && <Tags size={10} className="text-[#10b981]"/>}{o['Order Description']}</td>
                                  <td className="px-6 py-4 text-right text-gray-300 italic">€{Math.round(o._min).toLocaleString()}</td>
                                  <td className="px-6 py-4 text-right text-gray-300 italic">€{Math.round(o._max).toLocaleString()}</td>
                                  <td className="px-6 py-4 text-right text-gray-500 font-bold">€{Math.round(o._avg).toLocaleString()}</td>
                                  <td className="px-8 py-4 text-right text-sm">€{Math.round(o['Full This Year Projection']).toLocaleString()}</td>
                                  <td className={`px-8 py-4 text-right ${o.wow_delta > 0 ? 'text-red-500' : 'text-green-500'}`}>{o.wow_delta > 0 ? '+' : ''}{o.wow_delta?.toLocaleString()}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
        </main>

        {/* DRILL-DOWN PANEL */}
        <aside className="w-80 bg-[#1D1D1B] shrink-0 flex flex-col text-white shadow-2xl relative border-l border-white/5">
            <div className="p-6 bg-gradient-to-br from-[#222] to-[#1D1D1B] border-b border-white/5 shrink-0 text-center">
               <h3 className="text-[10px] font-black text-[#FFCC00] uppercase tracking-[0.3em] mb-2 opacity-60">Group Aggregate</h3>
               <p className="text-4xl font-black tracking-tighter">€{data.orders.reduce((a,b)=>a+(b['Full This Year Projection']||0),0).toLocaleString()}</p>
               <div className="mt-4 flex justify-between bg-white/5 p-2 rounded-xl text-[9px] font-black uppercase tracking-tighter">
                  <span className={data.wowTotalDelta >= 0 ? 'text-red-400' : 'text-green-400'}>Δ: €{data.wowTotalDelta.toLocaleString()}</span>
                  <span className="opacity-30">{selectedDate}</span>
               </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
               <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between uppercase text-[10px] font-black text-gray-500 tracking-widest">
                  <span>{currentMonthData?.month || 'Annual'} Breakdown</span>
                  <div className="flex gap-2">
                    <button onClick={handleCopy} className={`p-1.5 rounded transition-all ${isCopying ? 'bg-green-500 text-white shadow-md' : 'hover:bg-[#FFCC00] hover:text-black'}`} title="Copy Snippet"><Copy size={12}/></button>
                    <button onClick={handleEmail} className="p-1.5 rounded bg-white/5 hover:bg-[#D40511] transition-all" title="Email Analysis"><Mail size={12}/></button>
                  </div>
               </div>

               <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-black/10">
                  {focusItem && (
                    <div className="space-y-6">
                       <div className="border-b border-[#D40511]/30 pb-4">
                          <p className="text-[9px] font-black text-[#D40511] uppercase tracking-[0.2em] mb-1 opacity-80 uppercase tracking-widest">Line Snapshot</p>
                          <h4 className="text-lg font-black leading-tight text-[#FFCC00] uppercase tracking-tighter">{focusItem}</h4>
                       </div>
                       <div className="space-y-2.5">
                          {activeBreakdown.length > 0 ? activeBreakdown.map((item, idx) => (
                             <div key={idx} className="bg-white/5 p-3 rounded-xl border border-white/5 flex justify-between items-start group">
                                <span className="text-[10px] font-bold text-gray-400 leading-tight flex-1 mr-4 uppercase tracking-tighter">{item.material}</span>
                                <span className="text-[11px] font-black text-[#FFCC00] font-mono">€{Math.round(item.cost || 0).toLocaleString()}</span>
                             </div>
                          )) : <p className="text-[10px] font-bold text-gray-600 text-center py-10 uppercase italic">No details found</p>}
                       </div>
                    </div>
                  )}
               </div>
            </div>
            <div className="p-4 bg-black border-t border-white/10 shrink-0 flex justify-between text-[10px] font-black uppercase">
               <div className="flex items-center gap-2 text-gray-500"><AlertTriangle size={12}/> Health Audit</div>
               <span className="text-[#D40511]">€{data.audit?.ghostCost?.toLocaleString()} Leakage</span>
            </div>
        </aside>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #D40511; }
      `}} />
    </div>
  );
};

export default App;