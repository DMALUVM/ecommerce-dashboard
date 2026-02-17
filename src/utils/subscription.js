// Subscription status helpers for feature gating

/** Check if the subscription is in an active trial */
export function isTrialing(subscription) {
  if (!subscription) return false;
  if (subscription.status !== 'trialing') return false;
  if (!subscription.trial_end) return false;
  return new Date(subscription.trial_end) > new Date();
}

/** Check if the subscription is active (paid or trialing) */
export function isActive(subscription) {
  if (!subscription) return false;
  return subscription.status === 'active' || isTrialing(subscription);
}

/** Check if the subscription is past due (grace period) */
export function isPastDue(subscription) {
  if (!subscription) return false;
  return subscription.status === 'past_due';
}

/** Check if the subscription is canceled */
export function isCanceled(subscription) {
  if (!subscription) return false;
  return subscription.status === 'canceled';
}

/** Get the number of trial days remaining */
export function getTrialDaysRemaining(subscription) {
  if (!subscription || !subscription.trial_end) return 0;
  const now = new Date();
  const end = new Date(subscription.trial_end);
  const diff = end - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** Determine if the user needs to upgrade (trial expired, no active subscription) */
export function needsUpgrade(subscription) {
  if (!subscription) return true; // No subscription at all
  if (isActive(subscription)) return false;
  if (isPastDue(subscription)) return false; // Grace period — still allow access
  return true;
}

/** Get a human-readable status label */
export function getStatusLabel(subscription) {
  if (!subscription) return 'No subscription';
  if (isTrialing(subscription)) {
    const days = getTrialDaysRemaining(subscription);
    return `Trial — ${days} day${days !== 1 ? 's' : ''} remaining`;
  }
  if (subscription.status === 'active') return 'Pro';
  if (subscription.status === 'past_due') return 'Payment due';
  if (subscription.status === 'canceled') return 'Canceled';
  return subscription.status;
}
