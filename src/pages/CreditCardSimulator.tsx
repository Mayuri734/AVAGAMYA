import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calculator } from 'lucide-react';



export interface CreditCardSimulatorProps {
  initialPrincipal?: number;
  initialRoi?: number;
  initialTenure?: number;
  initialFee?: number;
}

export function CreditCardSimulator({
  initialPrincipal = 25000,
  initialRoi = 7,
  initialTenure = 6,
  initialFee = 1
}: CreditCardSimulatorProps = {}) {
  const [principal, setPrincipal] = useState(initialPrincipal);
  const [roi, setRoi] = useState(initialRoi);
  const [tenure, setTenure] = useState(initialTenure);
  const [processingFeeRate, setProcessingFeeRate] = useState(initialFee);

  const [schedule, setSchedule] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    emi: 0,
    processingFee: 0,
    totalInterest: 0,
    totalGST: 0,
    totalExtraPayable: 0,
    loanAmount: 0
  });

  const calculateEMI = () => {
    const P = principal;
    const r = (roi / 12) / 100;
    const n = tenure;
    
    let emi = 0;
    if (r === 0) {
      emi = P / n;
    } else {
      emi = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    }
    
    let balance = P;
    let totalInterest = 0;
    let totalGST = 0;
    const newSchedule = [];
    
    for (let month = 1; month <= n; month++) {
      const interestForMonth = balance * r;
      const principalForMonth = emi - interestForMonth;
      const gstForMonth = interestForMonth * 0.18; 
      const totalPayment = emi + gstForMonth;
      
      balance -= principalForMonth;
      if (balance < 0) balance = 0;
      
      totalInterest += interestForMonth;
      totalGST += gstForMonth;
      
      newSchedule.push({
        month,
        principalComponent: principalForMonth,
        interestComponent: interestForMonth,
        gst: gstForMonth,
        totalPayment,
        balance
      });
    }
    
    const processingFee = P * (processingFeeRate / 100);
    const gstOnProcessingFee = processingFee * 0.18;
    totalGST += gstOnProcessingFee;
    
    const totalExtraPayable = processingFee + totalInterest + totalGST;
    
    setSchedule(newSchedule);
    setSummary({
      emi,
      processingFee,
      totalInterest,
      totalGST,
      totalExtraPayable,
      loanAmount: P
    });
  };

  useEffect(() => {
    calculateEMI();
  }, []); // Initial calculation

  const chartData = [
    { name: 'Principal', value: summary.loanAmount || principal },
    { name: 'Interest', value: summary.totalInterest },
    { name: 'GST', value: summary.totalGST }
  ];

  const COLORS = ['#10b981', '#f97316', '#ef4444']; // emerald, orange, red

  const formatCurrency = (val: number) => {
    return '₹' + val.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  };

  return (
<div className="w-full scale-[0.9] origin-top">  
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Left Column - Inputs */}
<div className="bg-slate-800 text-white p-4 rounded-2xl flex flex-col justify-between shadow-lg">          <div>
            <h3 className="text-xl font-bold font-serif mb-6 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-orange-500" />
              Simulation Parameters
            </h3>
            
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Principal Amount (₹)</label>
                <input 
                  type="number" 
                  value={principal} 
                  onChange={e => setPrincipal(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Rate of Interest (%)</label>
                <input 
                  type="number" 
                  value={roi} 
                  onChange={e => setRoi(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Processing Fee Rate (%)</label>
                <input 
                  type="number" 
                  value={processingFeeRate} 
                  onChange={e => setProcessingFeeRate(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Tenure (Months)</label>
                <select 
                  value={tenure} 
                  onChange={e => setTenure(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 focus:ring-orange-500 outline-none transition-all appearance-none"
                >
                  {[3, 6, 9, 12, 18, 24].map(m => (
                    <option key={m} value={m}>{m} Months</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          <button 
            onClick={calculateEMI}
            className="mt-8 w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-orange-900/20 active:scale-[0.98]"
          >
            Calculate EMI
          </button>
        </div>

        {/* Center Column - Chart */}
        <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-xl flex flex-col items-center justify-center min-h-[300px]">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Cost Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Right Column - Summary */}
        <div className="bg-slate-100 p-8 rounded-3xl flex flex-col justify-between shadow-inner border border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6">Financial Summary</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="text-slate-600 font-medium">Loan Amount</span>
                <span className="font-bold text-slate-900">{formatCurrency(summary.loanAmount)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="text-slate-600 font-medium">Processing Fee</span>
                <span className="font-bold text-slate-900">{formatCurrency(summary.processingFee)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="text-slate-600 font-medium">Total Interest</span>
                <span className="font-bold text-orange-600">{formatCurrency(summary.totalInterest)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="text-slate-600 font-medium">Total GST (18%)</span>
                <span className="font-bold text-red-600">{formatCurrency(summary.totalGST)}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-slate-800 font-bold">Total Extra Payable</span>
                <span className="font-black text-slate-900">{formatCurrency(summary.totalExtraPayable)}</span>
              </div>
            </div>
          </div>
          
          <div className="mt-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Monthly EMI</p>
            <p className="text-4xl font-black text-emerald-600">{formatCurrency(summary.emi)}</p>
            <p className="text-[10px] text-slate-400 mt-2">*Excludes monthly GST on interest</p>
          </div>
        </div>

      </div>

      {/* Bottom Section - Table */}
      <div className="mt-8 bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800 font-serif">Amortization Schedule</h3>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800 text-white">
                <th className="p-4 text-xs font-bold uppercase tracking-widest">Month</th>
                <th className="p-4 text-xs font-bold uppercase tracking-widest">Principal</th>
                <th className="p-4 text-xs font-bold uppercase tracking-widest">Interest</th>
                <th className="p-4 text-xs font-bold uppercase tracking-widest">GST (18%)</th>
                <th className="p-4 text-xs font-bold uppercase tracking-widest">Total Payment</th>
                <th className="p-4 text-xs font-bold uppercase tracking-widest">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedule.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors even:bg-slate-50/50">
                  <td className="p-4 font-bold text-slate-600">#{row.month}</td>
                  <td className="p-4 font-medium text-slate-800">{formatCurrency(row.principalComponent)}</td>
                  <td className="p-4 font-medium text-orange-600">{formatCurrency(row.interestComponent)}</td>
                  <td className="p-4 font-medium text-red-600">{formatCurrency(row.gst)}</td>
                  <td className="p-4 font-bold text-emerald-600">{formatCurrency(row.totalPayment)}</td>
                  <td className="p-4 font-bold text-slate-900">{formatCurrency(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

        <div className="p-6 sm:p-10">
          <div className="mb-8">
            <h2 className="text-3xl font-bold font-serif text-slate-900">Credit Card Financial Simulator</h2>
            <p className="text-slate-500 mt-2">Discover hidden costs and calculate your true EMI obligations.</p>
          </div>
          
          <CreditCardSimulator />
        </div>
    

