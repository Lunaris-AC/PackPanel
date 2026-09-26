import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export const PackPanelLogo: React.FC<LogoProps> = ({
  className = '',
  size = 28,
  showText = false
}) => {
  return (
    <div className={`inline-flex items-center space-x-2.5 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Isometric Cube Top Face */}
        <path
          d="M16 2L29 9.5L16 17L3 9.5L16 2Z"
          className="fill-zinc-800 dark:fill-zinc-100"
        />
        {/* Top Face Inner Core (Data Node) */}
        <path
          d="M16 6.5L22 10L16 13.5L10 10L16 6.5Z"
          className="fill-sky-500 dark:fill-sky-400"
        />
        {/* Left Face */}
        <path
          d="M3 10.8L15 17.8V30.5L3 23.5V10.8Z"
          className="fill-zinc-600 dark:fill-zinc-400"
        />
        {/* Right Face */}
        <path
          d="M17 17.8L29 10.8V23.5L17 30.5V17.8Z"
          className="fill-zinc-700 dark:fill-zinc-300"
        />
        {/* Circuit line left */}
        <path
          d="M7 16L11 18.5V23.5"
          stroke="#0284c7"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Circuit line right */}
        <path
          d="M25 16L21 18.5V23.5"
          stroke="#38bdf8"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {showText && (
        <div className="flex items-baseline space-x-1.5">
          <span className="font-bold tracking-tight text-zinc-900 dark:text-zinc-50 text-base font-sans">
            Pack<span className="text-sky-500 dark:text-sky-400">Panel</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
            v1.0
          </span>
        </div>
      )}
    </div>
  );
};
