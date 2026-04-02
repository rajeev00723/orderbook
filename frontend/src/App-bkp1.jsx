import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { CheckSquare, Square, Upload, Calendar, Layers, BarChart3, Loader2, Info, Search, Copy, Check } from 'lucide-react';

// --- CUSTOM TOOLTIP COMPONENT ---
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1D1D1B] p-5 rounded-2xl shadow-2xl border border-white/10 text-white min-w-[320px] z-50">
        <p className="text-[10px] font-black text-[#FFCC00] uppercase tracking-widest mb-3 border-b border-white/10 pb-2">
          {label} 2025 Analysis
        </p>
        <div className="space-y-4">
          {payload.map((entry, index) => (
            <div key={index} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase tracking-tight" style={{ color: entry.color }}>
                   {entry.name}
                </span>
                <span className="text-sm font-black text-[#FFCC00]">€{entry.value.toLocaleString()}</span>
              </div>
              <div className="space-y-1.5 ml-2 border-l-2 border-white/10 pl-3">
                {entry.payload.breakdown && entry.payload.breakdown.length > 0 ? (
                    entry.payload.breakdown.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-[10px] leading-tight">
                            <span className="text-gray-400 max-w-[200px] truncate">{item.material}</span>
                            <span className="font-bold text-gray-300 ml-4">€{item.cost.toLocaleString()}</span>
                        </div>
                    ))
                ) : (
                    <p className="text-[9px] text-gray-500 italic">No material breakdown available</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const App = () => {
  const [reportDates, setReportDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [data, setData] = useState({ orders: [], individualTrends: [], cumulativeTrend: [] });
  const [viewMode, setViewMode] = useState('individual');
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [copyingId, setCopyingId] = useState(null); // Track which row is being copied
  const fileInputRef = useRef(null);

  const API_BASE = "http://localhost:8009/api";

  useEffect(() => { loadDates(); }, []);
  const loadDates = async () => {
    try {
      const res = await axios.get(`${API_BASE}/report-dates`);
      setReportDates(res.data);
      if (res.data.length > 0 && !selectedDate) setSelectedDate(res.data[0]);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (selectedDate) {
        axios.get(`${API_BASE}/products?report_date=${selectedDate}`).then(res => setProducts(res.data));
    }
  }, [selectedDate]);

  useEffect(() => {
    if (selectedProducts.length > 0 && selectedDate) {
      const params = new URLSearchParams();
      params.append('report_date', selectedDate);
      selectedProducts.forEach(p => params.append('product_names', p));
      axios.get(`${API_BASE}/summary?${params.toString()}`).then(res => setData(res.data));
    } else {
        setData({ orders: [], individualTrends: [], cumulativeTrend: [] });
    }
  }, [selectedProducts, selectedDate]);

  // --- NEW: SNIPPET COPY LOGIC ---
  const copySnippet = (order) => {
    const productTrend = data.individualTrends.find(t => t.name === order['Order Description']);
    // Format the snippet text
    let text = `${selectedDate} ANALYSIS\n\n`;
    text += `${order['Order Description'].toUpperCase()} - €${order['Full This Year Projection'].toLocaleString()}\n`;
    
    // Grab the breakdown from the first month available in the trend data
    if (productTrend && productTrend.data.length > 0) {
        const breakdown = productTrend.data[0].breakdown; // Using month 0 as example breakdown
        breakdown.forEach(item => {
            text += `  |-- ${item.material}: €${item.cost.toLocaleString()}\n`;
        });
    }

    navigator.clipboard.writeText(text);
    setCopyingId(order['Order Number']);
    setTimeout(() => setCopyingId(null), 2000);
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post(`${API_BASE}/upload`, formData);
      alert("Weekly Update Successful!");
      await loadDates();
    } catch (err) { alert("Format Error"); }
    setIsUploading(false);
  };

  return (
    <div className="h-screen w-screen bg-[#F6F6F6] flex flex-col overflow-hidden font-sans select-none">
      <header className="bg-[#D40511] h-16 flex items-center justify-between px-8 shrink-0 border-b-4 border-[#FFCC00] z-20 shadow-xl">
        <div className="text-white font-black italic text-2xl flex items-center gap-3">
            DHL <span className="font-light not-italic text-sm uppercase tracking-widest opacity-80 border-l pl-4 border-white/20">Global OrderBook</span>
        </div>
        <div className="flex items-center gap-6">
            <div className="bg-black/20 text-white px-4 py-2 rounded-xl flex items-center gap-3 text-xs border border-white/10">
                <Calendar size={14} className="text-[#FFCC00]"/>
                <select value={selectedDate} onChange={(e)=>setSelectedDate(e.target.value)} className="bg-transparent font-black outline-none cursor-pointer">
                    {reportDates.map(d => <option key={d} value={d} className="text-black">{d}</option>)}
                </select>
            </div>
            <button onClick={() => fileInputRef.current.click()} className="bg-[#FFCC00] hover:scale-105 active:scale-95 text-black px-6 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 transition-all shadow-lg uppercase">
                {isUploading ? <Loader2 className="animate-spin" size={14}/> : <Upload size={14}/>} Sync Report
            </button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleUpload} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 bg-white border-r flex flex-col shrink-0 shadow-sm z-10">
          <div className="p-6 border-b bg-gray-50/50">
             <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Product Inventory</h3>
             <div className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-300" size={14}/>
                <input type="text" placeholder="Search orders..." className="w-full bg-white border border-gray-200 rounded-xl py-2 pl-9 pr-4 text-xs outline-none" onChange={(e) => setSearchTerm(e.target.value)} />
             </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {products.filter(p => p.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
              <div key={p} onClick={() => setSelectedProducts(prev => prev.includes(p) ? prev.filter(i => i !== p) : [...prev, p])} className={`flex items-center gap-4 p-3.5 rounded-xl cursor-pointer text-[11px] font-black transition-all border ${selectedProducts.includes(p) ? 'bg-red-50 border-red-100 text-[#D40511]' : 'border-transparent hover:bg-gray-50 text-gray-500'}`}>
                {selectedProducts.includes(p) ? <CheckSquare size={18} className="fill-[#D40511] text-white"/> : <Square size={18} className="text-gray-200"/>}
                <span className="truncate uppercase">{p}</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-10 space-y-10 bg-[#F8F8F8]">
          <div className="flex justify-between items-end">
             <div>
                <h2 className="text-5xl font-black text-[#1D1D1B] tracking-tighter">Financial Aggregation</h2>
                <p className="text-sm text-gray-400 mt-2 font-medium flex items-center gap-2"><Info size={16} className="text-[#D40511]"/> Hover chart for details | Use Matrix below to <b>Copy Snippets</b></p>
             </div>
             <div className="flex bg-white rounded-2xl p-1.5 shadow-sm border">
                <button onClick={() => setViewMode('individual')} className={`px-8 py-3 rounded-xl text-xs font-black flex items-center gap-2 ${viewMode === 'individual' ? 'bg-[#D40511] text-white shadow-lg' : 'text-gray-400'}`}><Layers size={14}/> Individual</button>
                <button onClick={() => setViewMode('cumulative')} className={`px-8 py-3 rounded-xl text-xs font-black flex items-center gap-2 ${viewMode === 'cumulative' ? 'bg-[#FFCC00] text-black shadow-lg' : 'text-gray-400'}`}><BarChart3 size={14}/> Cumulative</button>
             </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 h-[520px]">
            {selectedProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="month" allowDuplicatedCategory={false} tick={{fontSize:11, fontWeight:800}} axisLine={false} />
                        <YAxis tick={{fontSize:11, fontWeight:800}} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#D40511", strokeWidth: 2, strokeDasharray: '5 5' }} />
                        <Legend verticalAlign="bottom" height={40} iconType="circle" />
                        {viewMode === 'individual' ? 
                            data.individualTrends.map((t, i) => (
                                <Area key={t.name} type="monotone" data={t.data} dataKey="cost" name={t.name} stroke={["#D40511", "#FFCC00", "#1D1D1B", "#9B9B9B"][i%4]} fill={["#D40511", "#FFCC00", "#1D1D1B", "#9B9B9B"][i%4]} fillOpacity={0.03} strokeWidth={4}/>
                            )) :
                            <Area type="monotone" data={data.cumulativeTrend} dataKey="cost" name="Total Aggregate" stroke="#D40511" fill="#D40511" fillOpacity={0.1} strokeWidth={6}/>
                        }
                    </AreaChart>
                </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-300 font-black uppercase tracking-widest opacity-30">Selection Required</div>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 pb-12">
            <div className="bg-[#1D1D1B] rounded-[3rem] p-12 text-white flex flex-col justify-between shadow-2xl relative overflow-hidden">
                <div className="absolute -right-16 -top-16 h-56 w-56 bg-[#D40511] rounded-full blur-[100px] opacity-25"></div>
                <h3 className="text-xs font-black opacity-40 uppercase tracking-[0.4em]">Group Projection (FY €)</h3>
                <p className="text-7xl font-black mt-6 text-[#FFCC00] tracking-tighter">€{data.orders.reduce((a,b)=>a+(b['Full This Year Projection']||0),0).toLocaleString()}</p>
                <div className="mt-12 pt-12 border-t border-white/10 text-[#D40511] font-black text-2xl">{selectedDate}</div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-[3rem] border shadow-sm overflow-hidden flex flex-col">
                <div className="px-12 py-8 border-b bg-gray-50/50 flex justify-between items-center text-xs font-black text-gray-400 uppercase tracking-[0.3em]">
                    Financial Matrix (€)
                </div>
                <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-left">
                        <thead className="bg-white text-[10px] font-black text-gray-300 uppercase sticky top-0 border-b">
                            <tr>
                                <th className="p-10 py-6">Product Line</th>
                                <th className="p-10 py-6 text-right">This Year (€)</th>
                                <th className="p-10 py-6 text-right w-20"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {data.orders.map((o, i) => (
                                <tr key={i} className="group hover:bg-red-50/30 transition-all cursor-default">
                                    <td className="p-10 py-7 text-sm font-black text-gray-700 uppercase tracking-tight">{o['Order Description']}</td>
                                    <td className="p-10 py-7 text-sm text-right font-black text-[#1D1D1B]">€{o['Full This Year Projection']?.toLocaleString()}</td>
                                    <td className="p-10 py-7 text-right">
                                        <button 
                                            onClick={() => copySnippet(o)}
                                            className={`p-2 rounded-lg transition-all ${copyingId === o['Order Number'] ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-[#D40511] hover:text-white'}`}
                                            title="Copy Snippet to Clipboard"
                                        >
                                            {copyingId === o['Order Number'] ? <Check size={16}/> : <Copy size={16}/>}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;