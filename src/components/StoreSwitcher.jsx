import { useState, useEffect, useRef } from 'react';

// ============================================================
// STORE SWITCHER — Dropdown for seamless multi-store navigation
// Place this in your top nav bar
// ============================================================

export default function StoreSwitcher({ 
  supabase, 
  userId, 
  currentStoreId, 
  onStoreChange,
  onAddStore 
}) {
  const [stores, setStores] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch stores
  useEffect(() => {
    async function fetchStores() {
      if (!supabase || !userId) {
        // Demo/local mode — use mock data
        setStores([
          { id: 'demo-1', name: 'My Store', platforms: ['shopify'], is_default: true },
        ]);
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('stores')
          .select('id, name, platforms, is_default, is_active')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('is_default', { ascending: false });
        
        if (!error && data) setStores(data);
      } catch (err) {
        console.error('Failed to fetch stores:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStores();
  }, [supabase, userId]);

  const currentStore = stores.find((s) => s.id === currentStoreId) || stores[0];

  const platformIcons = {
    amazon: '📦',
    shopify: '🛍️',
    quickbooks: '📊',
    meta_ads: '📱',
    google_ads: '🔍',
    warehouse: '🏭',
  };

  const getPlatformPills = (platforms) => {
    if (!platforms || !Array.isArray(platforms)) return null;
    return platforms.slice(0, 3).map((p) => platformIcons[p] || '•').join(' ');
  };

  if (loading || !currentStore) return null;

  // Single store — just show the name, no dropdown
  if (stores.length <= 1 && !onAddStore) {
    return (
      <div style={s.wrapper}>
        <div style={s.trigger}>
          <div style={s.storeDot(currentStore.is_default)} />
          <span style={s.storeName}>{currentStore.name}</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} style={s.wrapper}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={s.trigger}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div style={s.storeDot(true)} />
        <span style={s.storeName}>{currentStore.name}</span>
        <span style={s.chevron(isOpen)}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
      </button>

      {isOpen && (
        <div style={s.dropdown}>
          <div style={s.dropdownLabel}>YOUR STORES</div>
          {stores.map((store) => (
            <button
              key={store.id}
              onClick={() => {
                onStoreChange?.(store.id);
                setIsOpen(false);
              }}
              style={{
                ...s.dropdownItem,
                ...(store.id === currentStoreId ? s.dropdownItemActive : {}),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <div style={s.storeDot(store.id === currentStoreId)} />
                <div>
                  <div style={s.dropdownItemName}>{store.name}</div>
                  <div style={s.dropdownItemMeta}>
                    {getPlatformPills(store.platforms)}
                  </div>
                </div>
              </div>
              {store.id === currentStoreId && (
                <span style={s.activeCheck}>✓</span>
              )}
            </button>
          ))}

          {onAddStore && (
            <>
              <div style={s.divider} />
              <button
                onClick={() => { onAddStore(); setIsOpen(false); }}
                style={s.addStoreBtn}
              >
                <span style={s.addIcon}>+</span>
                Add Another Store
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}


// ============================================================
// STYLES
// ============================================================
const s = {
  wrapper: {
    position: 'relative',
    fontFamily: "'DM Sans', -apple-system, sans-serif",
  },
  trigger: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
    background: 'transparent', border: '1px solid #1E293B',
    color: '#E2E8F0', fontSize: 14, fontWeight: 600,
    transition: 'all 0.15s',
    minWidth: 160,
  },
  storeDot: (active) => ({
    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
    background: active ? '#10B981' : '#475569',
    boxShadow: active ? '0 0 6px #10B98166' : 'none',
  }),
  storeName: {
    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  chevron: (open) => ({
    display: 'flex', color: '#64748B',
    transform: open ? 'rotate(180deg)' : 'rotate(0)',
    transition: 'transform 0.2s',
  }),

  // Dropdown
  dropdown: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
    minWidth: 260, maxWidth: 320,
    background: '#111827', border: '1px solid #1E293B',
    borderRadius: 12, padding: '8px 0',
    boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
    zIndex: 1000,
  },
  dropdownLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
    color: '#475569', padding: '8px 16px 6px', textTransform: 'uppercase',
  },
  dropdownItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '10px 16px', border: 'none',
    background: 'transparent', color: '#E2E8F0',
    cursor: 'pointer', textAlign: 'left',
    transition: 'background 0.1s',
    fontSize: 14,
  },
  dropdownItemActive: {
    background: '#1E1B4B22',
  },
  dropdownItemName: {
    fontSize: 14, fontWeight: 600, color: '#F8FAFC',
  },
  dropdownItemMeta: {
    fontSize: 12, color: '#64748B', marginTop: 2,
  },
  activeCheck: {
    color: '#6366F1', fontSize: 14, fontWeight: 700,
  },

  divider: {
    height: 1, background: '#1E293B', margin: '6px 0',
  },
  addStoreBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '10px 16px', border: 'none',
    background: 'transparent', color: '#6366F1',
    cursor: 'pointer', textAlign: 'left',
    fontSize: 13, fontWeight: 600,
    transition: 'background 0.1s',
  },
  addIcon: {
    width: 22, height: 22, borderRadius: 6,
    background: '#1E1B4B', color: '#A5B4FC',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 700,
  },
};
