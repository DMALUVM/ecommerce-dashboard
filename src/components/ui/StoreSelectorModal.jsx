import React from 'react';
import { Store, X, Trash2, Plus } from 'lucide-react';

const StoreSelectorModal = ({
  showStoreModal,
  setShowStoreModal,
  session,
  stores,
  activeStoreId,
  switchStore,
  deleteStore,
  createStore
}) => {
  if (!showStoreModal || !session) return null;
  
  const currentStore = stores.find(s => s.id === activeStoreId);
  
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Store className="w-5 h-5" />
              My Stores
            </h2>
            <button onClick={() => setShowStoreModal(false)} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-slate-400 text-sm mt-1">Switch between stores or create a new one</p>
        </div>
        
        <div className="p-4 max-h-[50vh] overflow-y-auto">
          {/* Existing Stores */}
          {stores.length === 0 ? (
            <div className="text-center py-6 text-slate-500">
              <Store className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No stores yet. Create your first store below.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stores.map(store => (
                <div 
                  key={store.id}
                  className={`flex items-center justify-between p-3 rounded-xl border ${store.id === activeStoreId ? 'bg-violet-900/30 border-violet-500/50' : 'bg-slate-700/30 border-slate-600 hover:bg-slate-700/50'} cursor-pointer`}
                  onClick={() => { switchStore(store.id); setShowStoreModal(false); }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${store.id === activeStoreId ? 'bg-violet-600' : 'bg-slate-600'}`}>
                      <Store className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-medium">{store.name}</p>
                      <p className="text-slate-400 text-xs">Created {new Date(store.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {store.id === activeStoreId && (
                      <span className="px-2 py-0.5 bg-violet-500 rounded text-xs text-white">Active</span>
                    )}
                    <button 
                      onClick={(e) => { 
                        e.preventDefault();
                        e.stopPropagation(); 
                        deleteStore(store.id); 
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded transition-colors"
                      title={`Delete ${store.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Create New Store */}
        <div className="p-4 border-t border-slate-700">
          <p className="text-slate-300 text-sm mb-2">Create New Store</p>
          <div className="flex gap-2">
            <input
              type="text"
              id="modal-new-store-name"
              placeholder="Store name..."
              className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  createStore(e.target.value.trim());
                  e.target.value = '';
                }
              }}
            />
            <button
              onClick={() => {
                const input = document.getElementById('modal-new-store-name');
                if (input?.value?.trim()) {
                  createStore(input.value.trim());
                  input.value = '';
                }
              }}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-white text-sm flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoreSelectorModal;
