import { forwardRef, type InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, ...props },
  ref,
) {
  const classes = [styles.input, invalid ? styles.invalid : '', className]
    .filter(Boolean)
    .join(' ');
  return <input ref={ref} className={classes} {...props} />;
});