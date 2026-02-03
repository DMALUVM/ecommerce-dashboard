import React, { useState, useEffect, useRef } from 'react';
import { Upload, AlertCircle, FileText, Database, Boxes, Landmark, BarChart3, Zap, TrendingUp, Settings, ChevronRight, Loader2, CheckCircle, Sparkles } from 'lucide-react';

// ============ ANIMATED NUMBER COMPONENT ============
// Smooth counting animation for metrics

export const AnimatedNumber = ({ 
  value, 
  duration = 800, 
  prefix = '', 
  suffix = '',
  decimals = 0,
  className = '',
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);
  const animationRef = useRef(null);

  useEffect(() => {
    const startValue = previousValue.current;
    const endValue = typeof value === 'number' ? value : parseFloat(value) || 0;
    const startTime = performance.now();
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out cubic)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      const current = startValue + (endValue - startValue) * easeOut;
      setDisplayValue(current);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        previousValue.current = endValue;
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration]);

  const formattedValue = displayValue.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={className}>
      {prefix}{formattedValue}{suffix}
    </span>
  );
};

// ============ LOADING DOTS COMPONENT ============

export const LoadingDots = ({ className = '' }) => (
  <span className={`inline-flex gap-1 ${className}`}>
    <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
    <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
    <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
  </span>
);

// ============ PULSE DOT (Live indicator) ============

export const PulseDot = ({ color = 'emerald', size = 'md' }) => {
  const colors = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    blue: 'bg-blue-500',
    violet: 'bg-violet-500',
  };
  const sizes = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  };
  return (
    <span className="relative flex">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${colors[color]} opacity-75`} />
      <span className={`relative inline-flex rounded-full ${sizes[size]} ${colors[color]}`} />
    </span>
  );
};

// ============ SUCCESS CHECKMARK ANIMATION ============

export const SuccessCheck = ({ show, size = 'md' }) => {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };
  
  if (!show) return null;
  
  return (
    <div className={`${sizes[size]} rounded-full bg-emerald-500 flex items-center justify-center animate-scale-in`}>
      <CheckCircle className="w-2/3 h-2/3 text-white animate-draw-check" />
    </div>
  );
};

// ============ SHIMMER EFFECT ============

export const Shimmer = ({ className = '' }) => (
  <div className={`relative overflow-hidden ${className}`}>
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
  </div>
);

// ============ PROGRESS BAR ============

export const ProgressBar = ({ 
  value, 
  max = 100, 
  color = 'violet',
  size = 'md',
  showLabel = false,
  animated = true,
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  
  const colors = {
    violet: 'from-violet-600 to-indigo-600',
    emerald: 'from-emerald-600 to-green-600',
    amber: 'from-amber-600 to-orange-600',
    rose: 'from-rose-600 to-red-600',
    blue: 'from-blue-600 to-cyan-600',
  };
  
  const sizes = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className="w-full">
      <div className={`w-full bg-slate-700 rounded-full overflow-hidden ${sizes[size]}`}>
        <div 
          className={`h-full bg-gradient-to-r ${colors[color]} rounded-full transition-all duration-500 ease-out ${animated ? 'animate-pulse-subtle' : ''}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1 text-xs text-slate-400">
          <span>{value.toLocaleString()}</span>
          <span>{percentage.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
};

// ============ FADE IN COMPONENT ============

export const FadeIn = ({ children, delay = 0, duration = 300, className = '' }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div 
      className={`transition-all ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(10px)',
        transitionDuration: `${duration}ms`,
      }}
    >
      {children}
    </div>
  );
};

// ============ STAGGER CHILDREN ============

export const StaggerChildren = ({ children, staggerDelay = 50, className = '' }) => {
  return (
    <div className={className}>
      {React.Children.map(children, (child, index) => (
        <FadeIn delay={index * staggerDelay} key={index}>
          {child}
        </FadeIn>
      ))}
    </div>
  );
};

// ============ CARD COMPONENT ============
// Unified card styling for all containers

export const Card = ({ 
  children, 
  className = '', 
  variant = 'default', // default, elevated, outlined, gradient
  hover = true,
  padding = 'normal', // none, small, normal, large
  onClick,
}) => {
  const baseStyles = 'rounded-2xl transition-all duration-200';
  
  const variants = {
    default: 'bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700',
    elevated: 'bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 shadow-xl shadow-black/20',
    outlined: 'bg-slate-900/50 border border-slate-700',
    gradient: 'bg-gradient-to-br from-violet-900/30 to-indigo-900/30 border border-violet-500/30',
    success: 'bg-gradient-to-br from-emerald-900/30 to-green-900/30 border border-emerald-500/30',
    warning: 'bg-gradient-to-br from-amber-900/30 to-orange-900/30 border border-amber-500/30',
    danger: 'bg-gradient-to-br from-rose-900/30 to-red-900/30 border border-rose-500/30',
  };

  const paddings = {
    none: '',
    small: 'p-3',
    normal: 'p-5',
    large: 'p-6',
  };

  const hoverStyles = hover ? 'hover:border-slate-600 hover:shadow-lg hover:shadow-black/10' : '';
  const clickStyles = onClick ? 'cursor-pointer active:scale-[0.99]' : '';

  return (
    <div 
      className={`${baseStyles} ${variants[variant]} ${paddings[padding]} ${hoverStyles} ${clickStyles} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

// Card Header
export const CardHeader = ({ icon: Icon, title, subtitle, action, iconColor = 'violet' }) => {
  const iconColors = {
    violet: 'from-violet-500/20 to-cyan-500/20 text-violet-400',
    emerald: 'from-emerald-500/20 to-green-500/20 text-emerald-400',
    amber: 'from-amber-500/20 to-orange-500/20 text-amber-400',
    rose: 'from-rose-500/20 to-red-500/20 text-rose-400',
    blue: 'from-blue-500/20 to-cyan-500/20 text-blue-400',
    slate: 'from-slate-600/20 to-slate-500/20 text-slate-400',
  };

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={`p-2 rounded-xl bg-gradient-to-br ${iconColors[iconColor]}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          {subtitle && <p className="text-slate-400 text-sm">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
};

// ============ BUTTON COMPONENT ============
// Consistent button hierarchy

export const Button = ({
  children,
  variant = 'primary', // primary, secondary, danger, ghost, outline, success
  size = 'md', // sm, md, lg
  disabled = false,
  loading = false,
  icon: Icon,
  iconPosition = 'left',
  fullWidth = false,
  onClick,
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';

  const variants = {
    primary: 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/20',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600',
    danger: 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-lg shadow-rose-500/20',
    success: 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg shadow-emerald-500/20',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white',
    outline: 'bg-transparent border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white hover:bg-slate-800/50',
    warning: 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-500/20',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2',
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className={`${iconSizes[size]} animate-spin`} />
          <span>Loading...</span>
        </>
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className={iconSizes[size]} />}
          {children}
          {Icon && iconPosition === 'right' && <Icon className={iconSizes[size]} />}
        </>
      )}
    </button>
  );
};

// ============ EMPTY STATE COMPONENT ============
// Reusable empty state for all pages

const EMPTY_STATE_PRESETS = {
  inventory: {
    icon: Boxes,
    title: 'No Inventory Data',
    description: 'Connect your inventory sources or upload a snapshot to start tracking stock levels and reorder alerts.',
    primaryAction: { label: 'Upload Inventory', icon: Upload },
    secondaryAction: { label: 'Connect Sources', icon: Settings },
  },
  banking: {
    icon: Landmark,
    title: 'No Banking Data',
    description: 'Upload your bank or QuickBooks transactions to track expenses, categorize spending, and see profitability.',
    primaryAction: { label: 'Upload Transactions', icon: Upload },
  },
  ads: {
    icon: Zap,
    title: 'No Ads Data',
    description: 'Upload your Amazon Ads reports to get AI-powered optimization recommendations and track ROAS.',
    primaryAction: { label: 'Upload Ads Reports', icon: Upload },
  },
  sales: {
    icon: TrendingUp,
    title: 'No Sales Data',
    description: 'Upload your Amazon or Shopify sales data to start tracking revenue, trends, and performance.',
    primaryAction: { label: 'Upload Sales Data', icon: Upload },
  },
  analytics: {
    icon: BarChart3,
    title: 'Not Enough Data',
    description: 'Upload at least 2 weeks of sales data to unlock trends, charts, and analytics insights.',
    primaryAction: { label: 'Upload Data', icon: Upload },
  },
  '3pl': {
    icon: Database,
    title: 'No 3PL Data',
    description: 'Upload your Packiyo or 3PL billing reports to track fulfillment costs by order and week.',
    primaryAction: { label: 'Upload 3PL Data', icon: Upload },
    secondaryAction: { label: 'Connect Packiyo', icon: Settings },
  },
  generic: {
    icon: FileText,
    title: 'No Data Yet',
    description: 'Get started by uploading your data or connecting your accounts.',
    primaryAction: { label: 'Get Started', icon: Upload },
  },
};

export const EmptyState = ({
  preset, // Use a preset: 'inventory', 'banking', 'ads', 'sales', 'analytics', '3pl', 'generic'
  icon: CustomIcon,
  title,
  description,
  primaryAction,
  secondaryAction,
  onPrimaryClick,
  onSecondaryClick,
  compact = false,
}) => {
  // Use preset or custom values
  const config = preset ? EMPTY_STATE_PRESETS[preset] : {};
  const Icon = CustomIcon || config.icon || FileText;
  const displayTitle = title || config.title || 'No Data';
  const displayDescription = description || config.description || '';
  const primary = primaryAction || config.primaryAction;
  const secondary = secondaryAction || config.secondaryAction;

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mb-3">
          <Icon className="w-6 h-6 text-slate-500" />
        </div>
        <p className="text-slate-400 text-sm mb-3">{displayTitle}</p>
        {primary && onPrimaryClick && (
          <Button variant="outline" size="sm" icon={primary.icon} onClick={onPrimaryClick}>
            {primary.label}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center mb-6 shadow-xl">
        <Icon className="w-10 h-10 text-slate-500" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{displayTitle}</h3>
      <p className="text-slate-400 max-w-md mb-6">{displayDescription}</p>
      <div className="flex flex-col sm:flex-row gap-3">
        {primary && onPrimaryClick && (
          <Button variant="primary" icon={primary.icon} onClick={onPrimaryClick}>
            {primary.label}
          </Button>
        )}
        {secondary && onSecondaryClick && (
          <Button variant="secondary" icon={secondary.icon} onClick={onSecondaryClick}>
            {secondary.label}
          </Button>
        )}
      </div>
    </div>
  );
};

// ============ SKELETON LOADERS ============
// Content-shaped loading placeholders

export const Skeleton = ({ className = '', variant = 'text' }) => {
  const variants = {
    text: 'h-4 rounded',
    title: 'h-6 rounded w-1/3',
    avatar: 'h-10 w-10 rounded-full',
    card: 'h-32 rounded-2xl',
    button: 'h-10 w-24 rounded-xl',
    metric: 'h-8 w-20 rounded',
  };

  return (
    <div 
      className={`bg-slate-800 animate-pulse ${variants[variant]} ${className}`}
    />
  );
};

export const SkeletonCard = ({ rows = 3 }) => (
  <Card padding="normal">
    <div className="flex items-center gap-3 mb-4">
      <Skeleton variant="avatar" />
      <div className="flex-1">
        <Skeleton variant="title" className="mb-2" />
        <Skeleton variant="text" className="w-1/2" />
      </div>
    </div>
    <div className="space-y-3">
      {Array(rows).fill(0).map((_, i) => (
        <Skeleton key={i} variant="text" className={i === rows - 1 ? 'w-2/3' : ''} />
      ))}
    </div>
  </Card>
);

export const SkeletonMetrics = ({ count = 4 }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {Array(count).fill(0).map((_, i) => (
      <Card key={i} padding="normal">
        <Skeleton variant="text" className="w-1/2 mb-2" />
        <Skeleton variant="metric" className="mb-1" />
        <Skeleton variant="text" className="w-1/3" />
      </Card>
    ))}
  </div>
);

export const SkeletonTable = ({ rows = 5, cols = 4 }) => (
  <Card padding="none">
    <div className="p-4 border-b border-slate-700">
      <div className="flex gap-4">
        {Array(cols).fill(0).map((_, i) => (
          <Skeleton key={i} variant="text" className="flex-1" />
        ))}
      </div>
    </div>
    <div className="divide-y divide-slate-800">
      {Array(rows).fill(0).map((_, i) => (
        <div key={i} className="p-4 flex gap-4">
          {Array(cols).fill(0).map((_, j) => (
            <Skeleton key={j} variant="text" className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  </Card>
);

// ============ PAGE HEADER COMPONENT ============
// Consistent page headers with context

export const PageHeader = ({
  title,
  subtitle,
  icon: Icon,
  iconColor = 'violet',
  badge,
  actions,
  breadcrumbs,
}) => {
  const iconColors = {
    violet: 'from-violet-500 to-indigo-600',
    emerald: 'from-emerald-500 to-green-600',
    amber: 'from-amber-500 to-orange-600',
    rose: 'from-rose-500 to-red-600',
    blue: 'from-blue-500 to-cyan-600',
    slate: 'from-slate-500 to-slate-600',
  };

  return (
    <div className="mb-6">
      {breadcrumbs && (
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="w-3 h-3" />}
              {crumb.onClick ? (
                <button onClick={crumb.onClick} className="hover:text-white transition-colors">
                  {crumb.label}
                </button>
              ) : (
                <span className={i === breadcrumbs.length - 1 ? 'text-slate-300' : ''}>{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {Icon && (
            <div className={`p-3 rounded-2xl bg-gradient-to-br ${iconColors[iconColor]} shadow-lg`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{title}</h1>
              {badge && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  badge.variant === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                  badge.variant === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                  badge.variant === 'danger' ? 'bg-rose-500/20 text-rose-400' :
                  'bg-slate-700 text-slate-300'
                }`}>
                  {badge.label}
                </span>
              )}
            </div>
            {subtitle && <p className="text-slate-400 text-sm mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
};

// ============ STAT CARD COMPONENT ============
// Consistent metric display

export const StatCard = ({
  label,
  value,
  prefix = '',
  suffix = '',
  change,
  changeLabel,
  icon: Icon,
  iconColor = 'violet',
  size = 'md', // sm, md, lg
  onClick,
}) => {
  const iconColors = {
    violet: 'text-violet-400 bg-violet-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/20',
    amber: 'text-amber-400 bg-amber-500/20',
    rose: 'text-rose-400 bg-rose-500/20',
    blue: 'text-blue-400 bg-blue-500/20',
    slate: 'text-slate-400 bg-slate-500/20',
  };

  const sizes = {
    sm: { value: 'text-lg', label: 'text-xs', icon: 'w-4 h-4', padding: 'p-3' },
    md: { value: 'text-2xl', label: 'text-sm', icon: 'w-5 h-5', padding: 'p-4' },
    lg: { value: 'text-3xl', label: 'text-base', icon: 'w-6 h-6', padding: 'p-5' },
  };

  const s = sizes[size];

  return (
    <Card 
      padding="none" 
      onClick={onClick}
      className={s.padding}
    >
      <div className="flex items-start justify-between mb-2">
        <p className={`text-slate-400 ${s.label}`}>{label}</p>
        {Icon && (
          <div className={`p-1.5 rounded-lg ${iconColors[iconColor]}`}>
            <Icon className={s.icon} />
          </div>
        )}
      </div>
      <p className={`font-bold text-white ${s.value}`}>
        {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
      </p>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          <span className={`text-xs font-medium ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
          </span>
          {changeLabel && <span className="text-xs text-slate-500">{changeLabel}</span>}
        </div>
      )}
    </Card>
  );
};

// ============ BADGE COMPONENT ============

export const Badge = ({ children, variant = 'default', size = 'md' }) => {
  const variants = {
    default: 'bg-slate-700 text-slate-300',
    success: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    danger: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    info: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    violet: 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
  };

  const sizes = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-xs',
    lg: 'px-3 py-1 text-sm',
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-full ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
};

// ============ DIVIDER COMPONENT ============

export const Divider = ({ label, className = '' }) => {
  if (label) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="flex-1 h-px bg-slate-700" />
        <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
        <div className="flex-1 h-px bg-slate-700" />
      </div>
    );
  }
  return <div className={`h-px bg-slate-700 ${className}`} />;
};

// ============ TOOLTIP COMPONENT ============

export const Tooltip = ({ children, content, position = 'top' }) => {
  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div className="relative group">
      {children}
      <div className={`absolute ${positions[position]} px-2 py-1 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-slate-700`}>
        {content}
      </div>
    </div>
  );
};

// ============ BREADCRUMBS COMPONENT ============

export const Breadcrumbs = ({ items, className = '' }) => {
  return (
    <nav className={`flex items-center gap-2 text-sm mb-4 ${className}`}>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && <ChevronRight className="w-4 h-4 text-slate-600" />}
          {item.onClick ? (
            <button 
              onClick={item.onClick}
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              {item.icon && <item.icon className="w-4 h-4" />}
              {item.label}
            </button>
          ) : (
            <span className="text-white font-medium flex items-center gap-1.5">
              {item.icon && <item.icon className="w-4 h-4" />}
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

// ============ KEYBOARD SHORTCUTS MODAL ============

export const KeyboardShortcutsModal = ({ show, onClose }) => {
  if (!show) return null;
  
  const shortcuts = [
    { category: 'Navigation', items: [
      { keys: ['D'], description: 'Go to Dashboard' },
      { keys: ['U'], description: 'Go to Upload' },
      { keys: ['T'], description: 'Go to Trends' },
      { keys: ['I'], description: 'Go to Inventory' },
      { keys: ['A'], description: 'Go to Ads' },
      { keys: ['B'], description: 'Go to Banking' },
      { keys: ['S'], description: 'Go to Settings' },
    ]},
    { category: 'General', items: [
      { keys: ['Shift', '?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close modals' },
    ]},
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-lg w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            Keyboard Shortcuts
          </h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <span className="sr-only">Close</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-6">
          {shortcuts.map((group, groupIndex) => (
            <div key={groupIndex}>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                {group.category}
              </h3>
              <div className="space-y-2">
                {group.items.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-700/50 transition-colors">
                    <span className="text-slate-300">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <React.Fragment key={keyIndex}>
                          {keyIndex > 0 && <span className="text-slate-600 mx-0.5">+</span>}
                          <kbd className="px-2.5 py-1 bg-slate-900 border border-slate-600 rounded-lg text-sm font-mono text-white shadow-sm">
                            {key}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 pt-4 border-t border-slate-700">
          <p className="text-xs text-slate-500 text-center">
            Press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-300">Shift</kbd> + <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-300">?</kbd> anytime to show this help
          </p>
        </div>
      </div>
    </div>
  );
};

// ============ RELATIVE TIME COMPONENT ============

export const RelativeTime = ({ date, className = '' }) => {
  if (!date) return <span className={`text-slate-500 ${className}`}>Never</span>;
  
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  let text;
  let color = 'text-slate-400';
  
  if (diffMins < 1) {
    text = 'Just now';
    color = 'text-emerald-400';
  } else if (diffMins < 60) {
    text = `${diffMins}m ago`;
    color = 'text-emerald-400';
  } else if (diffHours < 24) {
    text = `${diffHours}h ago`;
    color = diffHours < 12 ? 'text-emerald-400' : 'text-slate-400';
  } else if (diffDays === 1) {
    text = 'Yesterday';
    color = 'text-amber-400';
  } else if (diffDays < 7) {
    text = `${diffDays}d ago`;
    color = 'text-amber-400';
  } else {
    text = then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    color = 'text-slate-500';
  }
  
  return (
    <span className={`${color} ${className}`} title={then.toLocaleString()}>
      {text}
    </span>
  );
};

// ============ DATA FRESHNESS INDICATOR ============

export const FreshnessIndicator = ({ lastUpdated, warningDays = 1, criticalDays = 7, label }) => {
  if (!lastUpdated) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <div className="w-2 h-2 rounded-full bg-slate-600" />
        <span>{label || 'No data'}</span>
      </div>
    );
  }
  
  const now = new Date();
  const then = new Date(lastUpdated);
  const diffDays = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  
  let color, bgColor, text;
  
  if (diffDays === 0) {
    color = 'text-emerald-400';
    bgColor = 'bg-emerald-500';
    text = 'Updated today';
  } else if (diffDays <= warningDays) {
    color = 'text-emerald-400';
    bgColor = 'bg-emerald-500';
    text = `${diffDays}d ago`;
  } else if (diffDays <= criticalDays) {
    color = 'text-amber-400';
    bgColor = 'bg-amber-500';
    text = `${diffDays}d ago`;
  } else {
    color = 'text-rose-400';
    bgColor = 'bg-rose-500';
    text = `${diffDays}d ago`;
  }
  
  return (
    <div className={`flex items-center gap-2 text-sm ${color}`}>
      <div className={`w-2 h-2 rounded-full ${bgColor} ${diffDays === 0 ? 'animate-pulse' : ''}`} />
      <span>{label ? `${label}: ${text}` : text}</span>
    </div>
  );
};

export default {
  Card,
  CardHeader,
  Button,
  EmptyState,
  Skeleton,
  SkeletonCard,
  SkeletonMetrics,
  SkeletonTable,
  PageHeader,
  StatCard,
  Badge,
  Divider,
  Tooltip,
  // Batch 2: Micro-interactions
  AnimatedNumber,
  LoadingDots,
  PulseDot,
  SuccessCheck,
  Shimmer,
  ProgressBar,
  FadeIn,
  StaggerChildren,
  // Batch 3: Navigation & Context
  Breadcrumbs,
  KeyboardShortcutsModal,
  RelativeTime,
  FreshnessIndicator,
};
