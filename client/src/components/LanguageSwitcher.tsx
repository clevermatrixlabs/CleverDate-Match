import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';
import { useEffect } from 'react';

// Language options with display names and locale codes
const languages = [
  { name: 'English', code: 'en' },
  { name: 'Español', code: 'es' },
  { name: 'Français', code: 'fr' },
  { name: '中文', code: 'zh' },
  { name: 'العربية', code: 'ar' },
  { name: 'हिन्दी', code: 'hi' },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  // Load preferred language on first render
  useEffect(() => {
    const preferred = localStorage.getItem('preferredLanguage');
    if (preferred && preferred !== i18n.language) {
      i18n.changeLanguage(preferred);
    }
  }, [i18n]);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('preferredLanguage', lng);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative group">
          <Globe className="h-5 w-5" />
          <span className="sr-only">Toggle language</span>
          <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-xs bg-blue-500 text-white rounded-full">
            {i18n.language.slice(0, 2).toUpperCase()}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => changeLanguage(language.code)}
            className={
              i18n.language === language.code
                ? 'bg-muted font-semibold'
                : ''
            }
          >
            {language.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}