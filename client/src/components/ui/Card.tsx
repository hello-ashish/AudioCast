import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'glass-panel rounded-xl p-6 md:p-8 flex flex-col gap-6 w-full max-w-md mx-auto',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
