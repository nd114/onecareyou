import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getLocale, selectableLocales } from '@/lib/locales';

/**
 * Language picker.
 *
 * Each language is listed in its own script — someone looking for Hausa is
 * looking for "Hausa", not for "Hausa (Nigeria)" written in English. Choosing
 * one persists to localStorage and switches writing direction immediately, so
 * Arabic mirrors the layout without a reload.
 */
export function LanguageSelector() {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const current = getLocale(i18n.resolvedLanguage);
  const options = selectableLocales();

  return (
    <div className="space-y-2">
      <Label htmlFor="language-select" className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        {t('settings:languageTitle', 'Language')}
      </Label>
      <Select value={current.code} onValueChange={(code) => void i18n.changeLanguage(code)}>
        <SelectTrigger id="language-select" className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((locale) => (
            <SelectItem key={locale.code} value={locale.code}>
              <span className="flex items-center gap-2">
                <span lang={locale.code} dir={locale.dir}>
                  {locale.nativeLabel}
                </span>
                {locale.reviewStatus === 'draft' && (
                  <span className="text-xs text-muted-foreground">
                    · {t('settings:languageInProgress', 'in progress')}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {current.reviewStatus === 'draft' && current.code !== 'en'
          ? t(
              'settings:languageNeedsReview',
              'In progress — some text will still appear in English.',
            )
          : t(
              'settings:languageDescription',
              'Choose the language you would like to use OneCare in.',
            )}
      </p>
    </div>
  );
}
