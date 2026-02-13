// cloudSync.js — Supabase save logic extracted from App.jsx pushToCloudNow
// Pure async function — no React state, no refs. Returns result for caller to handle.
import { devWarn, devError } from './logger';
import { trimIntelData } from './storage';

// Credentials to strip before saving to Supabase (SEC-003)
const CREDENTIAL_KEYS = ['shopifyCredentials', 'packiyoCredentials', 'amazonCredentials', 'qboCredentials'];

function stripCredentials(dataObj) {
  const clean = { ...dataObj };
  CREDENTIAL_KEYS.forEach(key => {
    if (clean[key]) {
      const cred = clean[key];
      clean[key] = {
        connected: cred.connected || false,
        lastSync: cred.lastSync || null,
        ...(cred.storeUrl && { storeUrl: cred.storeUrl }),
        ...(cred.realmId && { realmId: cred.realmId }),
        ...(cred.customerId && { customerId: cred.customerId }),
      };
    }
  });
  return clean;
}

/**
 * Validates that we're not about to overwrite populated cloud data with empty local data.
 * Returns { ok: true } or { ok: false, reason: string }
 */
function validateSaveData(localData, cloudStoreData, forceOverwrite) {
  const localSize = Object.keys(localData?.sales || {}).length
    + Object.keys(localData?.dailySales || {}).length
    + Object.keys(localData?.periods || {}).length;

  const cloudSize = Object.keys(cloudStoreData?.sales || {}).length
    + Object.keys(cloudStoreData?.dailySales || {}).length
    + Object.keys(cloudStoreData?.periods || {}).length;

  if (cloudSize > 5 && localSize === 0 && !forceOverwrite) {
    devError('BLOCKED: Attempted to overwrite', cloudSize, 'records with empty data.');
    return { ok: false, reason: 'blocked' };
  }
  if (cloudSize > localSize + 10 && !forceOverwrite) {
    devWarn('WARNING: Saving will reduce data count from', cloudSize, 'to', localSize);
  }
  return { ok: true };
}

/**
 * Check if cloud data has been modified since we last loaded (conflict detection).
 * Returns { conflict: false } or { conflict: true, cloudStoreData, cloudVersion }
 */
async function checkConflict(supabase, userId, activeStoreId, loadedCloudVersion) {
  const { data: currentCloud } = await supabase
    .from('app_data')
    .select('updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!currentCloud?.updated_at || currentCloud.updated_at <= loadedCloudVersion) {
    return { conflict: false };
  }

  // Cloud has newer data — fetch full data for resolution
  const { data: fullCloud } = await supabase
    .from('app_data')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();

  const targetStoreId = activeStoreId || 'default';
  const cloudStoreData = fullCloud?.data?.storeData?.[targetStoreId] || fullCloud?.data || {};

  return {
    conflict: true,
    cloudStoreData,
    cloudVersion: currentCloud.updated_at,
    cloudUpdatedAt: new Date(currentCloud.updated_at).toLocaleString(),
    localUpdatedAt: new Date().toLocaleString(),
  };
}

/**
 * Performs the actual Supabase upsert with credential stripping and store merging.
 * Returns { ok: true, updatedAt } or { ok: false, error }
 */
async function upsertCloudData(supabase, userId, dataObj, stores, activeStoreId) {
  // Trim large ads intel data before cloud save
  const cloudDataObj = { ...dataObj };
  if (cloudDataObj.adsIntelData) cloudDataObj.adsIntelData = trimIntelData(cloudDataObj.adsIntelData, 150);
  if (cloudDataObj.dtcIntelData) cloudDataObj.dtcIntelData = trimIntelData(cloudDataObj.dtcIntelData, 150);
  const sanitizedData = stripCredentials(cloudDataObj);

  const payload = {
    user_id: userId,
    data: {
      stores,
      activeStoreId,
      storeData: { [activeStoreId || 'default']: sanitizedData },
    },
    updated_at: new Date().toISOString(),
  };

  // Merge with existing stores data to preserve other stores
  const { data: existingData } = await supabase
    .from('app_data')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingData?.data?.storeData) {
    payload.data.storeData = {
      ...existingData.data.storeData,
      [activeStoreId || 'default']: sanitizedData,
    };
    payload.data.stores = existingData.data.stores || stores;
  }

  const { error } = await supabase.from('app_data').upsert(payload, { onConflict: 'user_id' });
  if (error) {
    devWarn('Cloud save failed:', error.message || error);
    return { ok: false, error: error.message || error };
  }

  return { ok: true, updatedAt: payload.updated_at };
}

export { validateSaveData, checkConflict, upsertCloudData, stripCredentials };
