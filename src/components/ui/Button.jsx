import React from 'react';

/**
 * Button component using the Design System `.app-btn` classes.
 * 
 * @param {object} props
 * @param {'primary' | 'secondary' | 'ghost' | 'danger'} [props.variant='secondary']
 * @param {React.ReactNode} [props.icon]
 * @param {boolean} [props.iconOnly=false]
 */
export function Button({
  variant = 'secondary',
  icon,
  iconOnly = false,
  children,
  ariaLabel,
  onClick,
  disabled,
  className = '',
  ...rest
}) {
  const classes = ['app-btn', `app-btn--${variant}`];
  if (iconOnly) classes.push('app-btn--icon');
  if (className) classes.push(className);
  
  return (
    <button
      type="button"
      className={classes.join(' ')}
      aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {icon}
      {!iconOnly && children}
    </button>
  );
}
