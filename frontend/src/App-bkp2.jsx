import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend, LabelList, PieChart, Pie, Cell 
} from 'recharts';
import { 
  CheckSquare, Square, Upload, Calendar, Layers, BarChart3, 
  Loader2, Info, Search, Box, MousePointer2, TrendingUp, TrendingDown,
  AlertTriangle, ChevronUp, ChevronDown, Copy, Check, Mail 
} from 'lucide-react';

/**
 * CUSTOM LABEL RENDERER
 * Logic: Renders specific month values on chart nodes only when hovered.
 */
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
  // --- CORE STATE ---
  const [reportDates, setReportDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [data, setData] = useState({ 
    orders: [], 
    unifiedChartData: [], 
    towerStats: [], // Reintegrated Tower Pie Data
    wowTotalDelta: 0, 
    audit: { ghostCount: 0, ghostCost: 0 } 
  });
  
  // --- INTERACTION & SORTING STATE ---
  const [activeMonthIndex, setActiveMonthIndex] = useState(null);
  const [focusProduct, setFocusProduct] = useState(null);
  const [viewMode, setViewMode] = useState('individual');
  const [sortConfig, setSortConfig] = useState({ key: 'Full This Year Projection', direction: 'desc' });
  const [searchTerm, setSearchTerm] = useState("");
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const fileInputRef = useRef(null);

  // --- CONFIG ---
  const API_BASE = "http://localhost:8009/api";
  const CHART_COLORS = ["#D40511", "#10b981", "#FFCC00", "#475569", "#8b5cf6", "#0ea5e9", "#ef4444"];
  const TOWER_COLORS = ['#334155', '#D40511', '#FFCC00', '#64748b', '#94a3b8'];
  const monthKeys = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];

  // --- INITIAL DATA LOAD ---
  useEffect(() => {
    const init = async () => {
      try {
        const res = await axios.get(`${API_BASE}/report-dates`);
        if (res.data && res.data.length > 0) {
          setReportDates(res.data);
          setSelectedDate(res.data[0]);
        }
      } catch (err) { console.error("Connection Error", err); }
      finally { setIsInitialLoading(false); }
    };
    init();
  }, []);

  // --- PRODUCT INVENTORY LOAD ---
  useEffect(() => { 
    if (selectedDate) {
      axios.get(`${API_BASE}/products?report_date=${selectedDate}`)
           .then(res => setProducts(res.data || []));
    }
  }, [selectedDate]);

  // --- MAIN ANALYTICS SYNC ---
  useEffect(() => {
    if (selectedProducts.length > 0 && selectedDate) {
      const params = new URLSearchParams();
      params.append('report_date', selectedDate);
      selectedProducts.forEach(p => params.append('product_names', p));
      
      axios.get(`${API_BASE}/summary?${params.toString()}`).then(res => {
        if (!res.data) return;
        
        // Unify Month Data for Chart
        const unified = monthKeys.map((m, idx) => {
            const entry = { month: m, index: idx };
            let monthSum = 0;
            (res.data.individualTrends || []).forEach(t => {
                const mData = t.data?.find(d => d.month === m);
                if (mData) {
                    entry[t.name] = mData.cost || 0;
                    entry[`${t.name}_breakdown`] = mData.breakdown || [];
                    monthSum += (mData.cost || 0);
                }
            });
            entry.cumulativeTotal = monthSum;
            return entry;
        });

        // Pre-Calculate Stats (Min, Max, Avg) for Matrix
        const processedOrders = (res.data.orders || []).map(o => {
            const vals = monthKeys.map(m => o[m] || 0);
            return { 
                ...o, 
                _min: Math.min(...vals), 
                _max: Math.max(...vals), 
                _avg: vals.reduce((a, b) => a + b, 0) / 12 
            };
        });

        setData({ 
            orders: processedOrders, 
            unifiedChartData: unified, 
            towerStats: res.data.towerStats || [],
            wowTotalDelta: res.data.wowTotalDelta || 0, 
            audit: res.data.audit || { ghostCount: 0, ghostCost: 0 } 
        });
        
        if (!focusProduct && selectedProducts.length > 0) setFocusProduct(selectedProducts[0]);
      });
    }
  }, [selectedProducts, selectedDate]);

  // --- SORTING LOGIC ---
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const sortedOrders = useMemo(() => {
    let sortableItems = [...data.orders];
    if (sortConfig) {
      sortableItems.sort((a, b) => {
        let aV = a[sortConfig.key]; let bV = b[sortConfig.key];
        if (typeof aV === 'string') return sortConfig.direction === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV);
        return sortConfig.direction === 'asc' ? aV - bV : bV - aV;
      });
    }
    return sortableItems;
  }, [data.orders, sortConfig]);

  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) return <div className="w-3" />;
    return sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-[#D40511]" /> : <ChevronDown size={12} className="text-[#D40511]" />;
  };

  // --- SHARING LOGIC (SNIPPET & EMAIL) ---
  const generateSnippetText = () => {
    const monthName = activeMonthIndex !== null ? monthKeys[activeMonthIndex] : "ANNUAL";
    const snapshot = activeMonthIndex !== null ? (data.unifiedChartData[activeMonthIndex] || {}) : {};
    const breakdown = focusProduct ? (snapshot[`${focusProduct}_breakdown`] || []) : [];
    const totalVal = focusProduct ? (snapshot[focusProduct] || 0) : 0;

    let txt = `DHL FINANCE INSIGHTS - ${selectedDate}\n`;
    txt += `FOCUS: ${focusProduct?.toUpperCase()}\n`;
    txt += `PERIOD: ${monthName.toUpperCase()} 2025\n`;
    txt += `VALUE: €${totalVal.toLocaleString()}\n\n`;
    txt += `MATERIAL BREAKDOWN:\n`;
    breakdown.forEach(item => { txt += `  - ${item.material}: €${item.cost.toLocaleString()}\n`; });
    return txt;
  };

  const handleCopy = () => {
    if (!focusProduct) return;
    navigator.clipboard.writeText(generateSnippetText());
    setIsCopying(true);
    setTimeout(() => setIsCopying(false), 2000);
  };

  const handleEmail = () => {
    if (!focusProduct) return;
    const body = encodeURIComponent(generateSnippetText());
    const subject = encodeURIComponent(`Financial Performance: ${focusProduct} (${selectedDate})`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  // --- UPLOAD HANDLER ---
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const fd = new FormData(); fd.append('file', file);
    try {
      await axios.post(`${API_BASE}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert("Weekly Sync Successful!");
      window.location.reload();
    } catch (err) { alert("Upload Failed: Check filename date YYYYMMDD"); setIsUploading(false); }
  };

  // --- DATA DERIVATIVES FOR UI ---
  const currentMonthData = activeMonthIndex !== null ? (data.unifiedChartData[activeMonthIndex] || {}) : {};
  const activeBreakdown = focusProduct ? (currentMonthData[`${focusProduct}_breakdown`] || []) : [];

  if (isInitialLoading) return <div className="h-screen w-screen bg-[#1D1D1B] flex items-center justify-center text-white font-black italic">LOADING DHL FINANCE...</div>;

  return (
    <div className="h-screen w-screen bg-[#F0F0F0] flex flex-col overflow-hidden font-sans text-[#1D1D1B] select-none">
      
      {/* GLOBAL HEADER */}
      <header className="bg-[#D40511] h-14 flex items-center justify-between px-6 shrink-0 border-b-4 border-[#FFCC00] z-30 shadow-xl">
        <div className="text-white font-black italic text-xl tracking-tighter">
          DHL <span className="font-light not-italic text-xs ml-2 uppercase opacity-80 border-l pl-3 border-white/20">Finance Command Center</span>
        </div>
        <div className="flex items-center gap-4">
            <div className="bg-black/20 text-white px-3 py-1 rounded-lg flex items-center gap-2 text-[10px] border border-white/10">
                <Calendar size={12} className="text-[#FFCC00]"/>
                <select value={selectedDate} onChange={(e)=>setSelectedDate(e.target.value)} className="bg-transparent font-bold outline-none cursor-pointer uppercase tracking-tighter">
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
        
        {/* SIDEBAR: PRODUCT LIST (20%) */}
        <aside className="w-64 bg-white border-r flex flex-col shrink-0 shadow-sm z-10">
          <div className="p-4 border-b bg-gray-50/50">
             <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 tracking-tighter">Active Inventory</h3>
             <div className="relative">
                <Search className="absolute left-2.5 top-2.5 text-gray-300" size={12}/>
                <input type="text" placeholder="Search orders..." className="w-full bg-white border border-gray-200 rounded-lg py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-[#D40511]" onChange={(e) => setSearchTerm(e.target.value)}/>
             </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {(products || []).filter(p => p.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
              <div key={p} onClick={() => setSelectedProducts(prev => prev.includes(p) ? prev.filter(i => i !== p) : [...prev, p])} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer text-[10px] font-bold transition-all border mb-1 ${selectedProducts.includes(p) ? 'bg-red-50 border-red-100 text-[#D40511]' : 'border-transparent hover:bg-gray-50 text-gray-500'}`}>
                {selectedProducts.includes(p) ? <CheckSquare size={14} className="fill-[#D40511] text-white"/> : <Square size={14} className="text-gray-200"/>}
                <span className="truncate uppercase tracking-tight">{p}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN PANEL: CHARTS & MATRIX (55%) */}
        <main className="flex-1 flex flex-col overflow-hidden p-6 gap-6">
          <div className="flex justify-between items-center shrink-0 px-2">
             <h2 className="text-2xl font-black tracking-tighter uppercase tracking-widest">Market Overview</h2>
             <div className="flex bg-white rounded-xl p-1 shadow-sm border border-gray-200">
                <button onClick={() => setViewMode('individual')} className={`px-5 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-2 transition-all ${viewMode === 'individual' ? 'bg-[#D40511] text-white shadow-md' : 'text-gray-400'}`}><Layers size={12}/> Individual</button>
                <button onClick={() => setViewMode('cumulative')} className={`px-5 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-2 transition-all ${viewMode === 'cumulative' ? 'bg-[#1D1D1B] text-white shadow-md' : 'text-gray-400'}`}><BarChart3 size={12}/> Cumulative</button>
             </div>
          </div>

          {/* TOP CHART ROW (Split 3:1 for Trend and Tower Pie) */}
          <div className="flex-1 flex gap-6 overflow-hidden">
             
             {/* AREA TREND CHART */}
             <div className="flex-[3] bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden relative">
               {selectedProducts.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                    <AreaChart 
                      data={data.unifiedChartData} 
                      onMouseMove={(e) => { if (e && e.activeTooltipIndex !== undefined) setActiveMonthIndex(e.activeTooltipIndex); }}
                      onMouseLeave={() => setActiveMonthIndex(null)}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{fontSize:10, fontWeight:900}} axisLine={false} tickLine={false} />
                      <YAxis tick={{fontSize:10, fontWeight:900}} axisLine={false} tickLine={false} />
                      <Tooltip content={<div className="hidden"/>} cursor={{ stroke: "#D40511", strokeWidth: 2, strokeDasharray: '5 5' }} />
                      
                      {viewMode === 'individual' ? 
                        selectedProducts.map((pName, i) => (
                          <Area 
                            key={pName} type="monotone" dataKey={pName} 
                            stroke={CHART_COLORS[i % CHART_COLORS.length]} 
                            fill={CHART_COLORS[i % CHART_COLORS.length]} 
                            fillOpacity={focusProduct === pName ? 0.15 : 0.01}
                            strokeWidth={focusProduct === pName ? 5 : 2}
                            onMouseEnter={() => setFocusProduct(pName)}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                          >
                            <LabelList content={<RenderActiveValueLabel activeIndex={activeMonthIndex} />} />
                          </Area>
                        )) :
                        <Area dataKey="cumulativeTotal" type="monotone" name="Total" stroke="#D40511" fill="#D40511" fillOpacity={0.1} strokeWidth={5}>
                            <LabelList content={<RenderActiveValueLabel activeIndex={activeMonthIndex} />} />
                        </Area>
                      }
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </AreaChart>
                 </ResponsiveContainer>
               ) : <div className="h-full flex items-center justify-center text-gray-300 font-black tracking-widest opacity-20 italic">SELECT PRODUCTS TO START</div>}
             </div>

             {/* TOWER COST PIE CHART */}
             <div className="flex-1 bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col">
                <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4">Tower Density</h3>
                <div className="flex-1">
                   <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                         <Pie data={data.towerStats} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                            {data.towerStats.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={TOWER_COLORS[index % TOWER_COLORS.length]} />
                            ))}
                         </Pie>
                         <Tooltip formatter={(v) => `€${Math.round(v).toLocaleString()}`}/>
                      </PieChart>
                   </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-4">
                   {data.towerStats.slice(0,3).map((t,i) => (
                      <div key={i} className="flex justify-between text-[9px] font-black uppercase">
                         <span className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full" style={{backgroundColor: TOWER_COLORS[i]}}></div>{t.name}</span>
                         <span className="text-gray-400">€{Math.round(t.value).toLocaleString()}</span>
                      </div>
                   ))}
                </div>
             </div>
          </div>

          {/* SORTABLE MATRIX TABLE */}
          <div className="h-1/3 bg-white rounded-[2rem] border shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-3 border-b bg-gray-50/50 flex justify-between items-center text-[9px] font-black text-gray-400 uppercase tracking-widest">Projection Delta Matrix</div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left">
                      <thead className="bg-white text-[8px] font-black text-gray-300 uppercase sticky top-0 border-b z-20">
                          <tr>
                            <th onClick={() => requestSort('Order Description')} className="px-8 py-3 cursor-pointer hover:text-[#D40511]">Product {renderSortIcon('Order Description')}</th>
                            <th onClick={() => requestSort('_min')} className="px-6 py-3 text-right cursor-pointer hover:text-[#D40511]">Min {renderSortIcon('_min')}</th>
                            <th onClick={() => requestSort('_max')} className="px-6 py-3 text-right cursor-pointer hover:text-[#D40511]">Max {renderSortIcon('_max')}</th>
                            <th onClick={() => requestSort('_avg')} className="px-6 py-3 text-right cursor-pointer hover:text-[#D40511]">Avg {renderSortIcon('_avg')}</th>
                            <th onClick={() => requestSort('Full This Year Projection')} className="px-8 py-3 text-right cursor-pointer hover:text-[#D40511]">FY € {renderSortIcon('Full This Year Projection')}</th>
                            <th onClick={() => requestSort('wow_delta')} className="px-8 py-3 text-right cursor-pointer hover:text-[#D40511]">Weekly Δ {renderSortIcon('wow_delta')}</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-[10px] font-black">
                          {sortedOrders.map((o, i) => (
                              <tr key={i} onMouseEnter={() => setFocusProduct(o['Order Description'])} className={`hover:bg-red-50/50 transition-all ${focusProduct === o['Order Description'] ? 'bg-red-50/70 border-l-4 border-[#D40511]' : ''}`}>
                                  <td className="px-8 py-4 uppercase text-[10px]">{o['Order Description']}</td>
                                  <td className="px-6 py-4 text-right text-gray-400 font-normal italic">€{Math.round(o._min).toLocaleString()}</td>
                                  <td className="px-6 py-4 text-right text-gray-400 font-normal italic">€{Math.round(o._max).toLocaleString()}</td>
                                  <td className="px-6 py-4 text-right text-gray-500 font-bold">€{Math.round(o._avg).toLocaleString()}</td>
                                  <td className="px-8 py-4 text-right text-sm">€{o['Full This Year Projection']?.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                                  <td className={`px-8 py-4 text-right ${o.wow_delta > 0 ? 'text-red-500' : 'text-green-500'}`}>{o.wow_delta > 0 ? '+' : ''}{o.wow_delta?.toLocaleString()}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
        </main>

        {/* COLUMN 3: DRILL-DOWN PANEL (25%) */}
        <aside className="w-80 bg-[#1D1D1B] shrink-0 flex flex-col text-white shadow-2xl relative border-l border-white/5">
            <div className="p-6 bg-gradient-to-br from-[#222] to-[#1D1D1B] border-b border-white/5 shrink-0">
               <h3 className="text-[10px] font-black text-[#FFCC00] uppercase tracking-[0.3em] mb-2 opacity-60 text-center uppercase tracking-widest">Aggregation</h3>
               <p className="text-4xl font-black text-center tracking-tighter italic">€{(data.orders || []).reduce((a,b)=>a+(b['Full This Year Projection']||0),0).toLocaleString()}</p>
               <div className="mt-5 flex justify-between items-center bg-white/5 p-2 rounded-xl border border-white/5">
                  <span className={`text-[9px] font-black px-2 py-1 rounded uppercase tracking-tighter ${data.wowTotalDelta >= 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                    WoW Δ: €{(data.wowTotalDelta || 0).toLocaleString()}
                  </span>
                  <span className="text-[9px] opacity-30 uppercase font-black tracking-tighter">{selectedDate}</span>
               </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
               <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <MousePointer2 size={12} className="text-[#FFCC00]"/>
                    {currentMonthData?.month || 'Annual'} Breakdown
                  </span>
                  <Box size={14} className="text-[#D40511]"/>
               </div>

               <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-black/5">
                  {focusProduct && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                       <div className="border-b border-[#D40511]/30 pb-4">
                          <div className="flex justify-between items-start mb-2">
                             <p className="text-[9px] font-black text-[#D40511] uppercase tracking-[0.2em] opacity-80 tracking-widest">Focus Analysis</p>
                             {/* SHARE BUTTONS REINTEGRATED */}
                             <div className="flex gap-2">
                                <button onClick={handleCopy} className={`p-1.5 rounded transition-all ${isCopying ? 'bg-green-500' : 'bg-white/5 hover:bg-[#FFCC00] hover:text-black'}`} title="Copy Snippet">
                                   {isCopying ? <Check size={12}/> : <Copy size={12}/>}
                                </button>
                                <button onClick={handleEmail} className="p-1.5 rounded bg-white/5 hover:bg-[#D40511] transition-all" title="Email Analysis">
                                   <Mail size={12}/>
                                </button>
                             </div>
                          </div>
                          <h4 className="text-lg font-black leading-tight text-[#FFCC00] uppercase tracking-tighter">{focusProduct}</h4>
                       </div>
                       <div className="space-y-2.5">
                          {activeBreakdown.length > 0 ? activeBreakdown.map((item, idx) => (
                             <div key={idx} className="bg-white/5 p-3 rounded-xl border border-white/5 hover:border-[#FFCC00]/50 transition-all flex justify-between items-start group">
                                <span className="text-[10px] font-bold text-gray-400 leading-tight flex-1 mr-4 group-hover:text-white uppercase tracking-tight">{item.material}</span>
                                <span className="text-[11px] font-black text-[#FFCC00] font-mono whitespace-nowrap">€{Math.round(item.cost || 0).toLocaleString()}</span>
                             </div>
                          )) : <p className="text-[10px] font-bold text-gray-600 text-center py-10 uppercase italic">No details for point</p>}
                       </div>
                    </div>
                  )}
               </div>
            </div>

            <div className="p-4 bg-black border-t border-white/10 shrink-0">
               <div className="flex justify-between items-center px-2">
                  <div className="flex items-center gap-3 text-gray-500">
                    <AlertTriangle size={14} className={data.audit?.ghostCount > 0 ? "text-[#D40511] animate-pulse" : ""}/>
                    <span className="text-[9px] font-black uppercase tracking-widest tracking-tighter">Audit Monitor</span>
                  </div>
                  <span className="text-[10px] font-black text-[#D40511] italic tracking-tighter uppercase font-mono">€{data.audit?.ghostCost?.toLocaleString() || 0} Leakage</span>
               </div>
            </div>
        </aside>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #D40511; }
      `}} />
    </div>
  );
};

export default App;