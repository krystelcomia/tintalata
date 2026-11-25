import logoImg from '../assets/tintalata-logo.png';

interface TintalataLogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'light';
}

export function TintalataLogo({ size = 'md', variant = 'default' }: TintalataLogoProps) {
  const dims =
    size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-16 w-16' : 'h-12 w-12';
  const ring =
    variant === 'light'
      ? 'ring-2 ring-white/40 shadow-md shadow-blue-950/25'
      : 'ring-2 ring-blue-100 shadow-md shadow-blue-700/15';

  return (
    <img
      src={logoImg}
      alt="Tintalata Logo"
      className={`${dims} ${ring} rounded-full object-cover shrink-0 bg-white select-none`}
    />
  );
}
