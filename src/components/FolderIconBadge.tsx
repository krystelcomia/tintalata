import {
  Folder,
  BookOpen,
  GraduationCap,
  Palette,
  FlaskConical,
  Calculator,
  Star,
  Briefcase,
} from 'lucide-react';
import type { FolderColor, FolderIcon } from '../types';
import { FOLDER_COLOR_STYLES } from '../utils/api';

interface FolderIconBadgeProps {
  icon: FolderIcon;
  color: FolderColor;
  size?: 'sm' | 'md' | 'lg';
}

export function FolderGlyph({ icon, className }: { icon: FolderIcon; className?: string }) {
  switch (icon) {
    case 'book':
      return <BookOpen className={className} />;
    case 'graduation':
      return <GraduationCap className={className} />;
    case 'palette':
      return <Palette className={className} />;
    case 'flask':
      return <FlaskConical className={className} />;
    case 'calculator':
      return <Calculator className={className} />;
    case 'star':
      return <Star className={className} />;
    case 'briefcase':
      return <Briefcase className={className} />;
    default:
      return <Folder className={className} />;
  }
}

export function FolderIconBadge({ icon, color, size = 'md' }: FolderIconBadgeProps) {
  const style = FOLDER_COLOR_STYLES[color] || FOLDER_COLOR_STYLES.blue;
  const boxSize =
    size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-12 w-12 rounded-2xl' : 'h-10 w-10 rounded-xl';
  const glyphSize = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';

  return (
    <div
      className={`${boxSize} ${style.bg} ${style.text} border ${style.border} flex items-center justify-center shrink-0`}
    >
      <FolderGlyph icon={icon} className={glyphSize} />
    </div>
  );
}
