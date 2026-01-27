import marpeLogoSrc from '@/assets/marpe-logo.png';

interface MarpeLogoIconProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export function MarpeLogoIcon({ className = '', size = 'md' }: MarpeLogoIconProps) {
  return (
    <img 
      src={marpeLogoSrc} 
      alt="Marpe Logo" 
      className={`${sizeMap[size]} ${className}`}
    />
  );
}
