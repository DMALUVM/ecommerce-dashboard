import React from 'react';
import { Target } from 'lucide-react';

const GoalsModal = ({ showGoalsModal, setShowGoalsModal, goals, saveGoals }) => {
  if (!showGoalsModal) return null;
  
  const handleSave = () => {
    const weeklyRev = parseFloat(document.getElementById('goal-weekly-rev')?.value) || 0;
    const weeklyProf = parseFloat(document.getElementById('goal-weekly-prof')?.value) || 0;
    const monthlyRev = parseFloat(document.getElementById('goal-monthly-rev')?.value) || 0;
    const monthlyProf = parseFloat(document.getElementById('goal-monthly-prof')?.value) || 0;
    saveGoals({ weeklyRevenue: weeklyRev, weeklyProfit: weeklyProf, monthlyRevenue: monthlyRev, monthlyProfit: monthlyProf });
  };
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Target className="w-6 h-6 text-amber-400" />Set Goals</h2>
        <p className="text-slate-400 text-sm mb-4">Set revenue and profit targets to track your progress</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Weekly Revenue Target</label>
            <input type="number" id="goal-weekly-rev" defaultValue={goals.weeklyRevenue || ''} placeholder="e.g., 5000" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Weekly Profit Target</label>
            <input type="number" id="goal-weekly-prof" defaultValue={goals.weeklyProfit || ''} placeholder="e.g., 1500" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Monthly Revenue Target</label>
            <input type="number" id="goal-monthly-rev" defaultValue={goals.monthlyRevenue || ''} placeholder="e.g., 20000" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Monthly Profit Target</label>
            <input type="number" id="goal-monthly-prof" defaultValue={goals.monthlyProfit || ''} placeholder="e.g., 6000" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 rounded-xl">Save Goals</button>
          <button onClick={() => setShowGoalsModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-xl">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default GoalsModal;
