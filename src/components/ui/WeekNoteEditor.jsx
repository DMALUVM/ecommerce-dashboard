import React from 'react';
import { StickyNote } from 'lucide-react';

const WeekNoteEditor = ({ 
  weekKey, 
  compact = false, 
  weekNotes, 
  setWeekNotes, 
  editingNote, 
  setEditingNote, 
  noteText, 
  setNoteText 
}) => {
  const note = weekNotes[weekKey] || '';
  const isEditing = editingNote === weekKey;
  
  if (compact) {
    return note ? (
      <div className="flex items-center gap-1 text-amber-400 text-xs cursor-pointer" onClick={() => { setEditingNote(weekKey); setNoteText(note); }}>
        <StickyNote className="w-3 h-3" />
        <span className="truncate max-w-[100px]">{note}</span>
      </div>
    ) : (
      <button onClick={() => { setEditingNote(weekKey); setNoteText(''); }} className="text-slate-500 hover:text-slate-400 text-xs flex items-center gap-1">
        <StickyNote className="w-3 h-3" />Add note
      </button>
    );
  }
  
  if (isEditing) {
    return (
      <div className="flex gap-2 items-start">
        <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note (e.g., 'Ran 20% off promo')"
          className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none" rows={2} />
        <div className="flex flex-col gap-1">
          <button onClick={() => { setWeekNotes(p => ({...p, [weekKey]: noteText})); setEditingNote(null); }}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg">Save</button>
          <button onClick={() => setEditingNote(null)} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg">Cancel</button>
        </div>
      </div>
    );
  }
  
  return note ? (
    <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-500/30 rounded-lg p-2 cursor-pointer" onClick={() => { setEditingNote(weekKey); setNoteText(note); }}>
      <StickyNote className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-amber-200 text-sm">{note}</p>
    </div>
  ) : (
    <button onClick={() => { setEditingNote(weekKey); setNoteText(''); }} className="text-slate-500 hover:text-slate-400 text-sm flex items-center gap-1">
      <StickyNote className="w-4 h-4" />Add note for this week
    </button>
  );
};

export default WeekNoteEditor;
