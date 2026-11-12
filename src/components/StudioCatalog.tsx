import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Search, Sparkles, FileBox, Image as ImageIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getProduct } from '../products/catalog';
import { moduleCategories, moduleDirectory, moduleOrder, type ModuleCategory } from '../products/moduleDirectory';
import type { ProductType } from '../types';
import { ModuleIcon } from './ModuleIcon';

interface Props {
  active: ProductType;
  demo: boolean;
  disabled: boolean;
  onOpen: (type: ProductType) => void;
  onResume: () => void;
}

export function StudioCatalog({ active, demo, disabled, onOpen, onResume }: Props) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<ModuleCategory | 'all'>(moduleDirectory[active].category);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ProductType>(active);
  const available = moduleOrder.filter((type) => !demo || moduleDirectory[type].mode === 'create');
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const name = (type: ProductType) => t(`products.${type}.name`, { defaultValue: getProduct(type).name });
  const description = (type: ProductType) => t(`products.${type}.description`, { defaultValue: getProduct(type).description });
  const matching = available.filter((type) => (query || category === 'all' || moduleDirectory[type].category === category)
    && normalize(`${name(type)} ${description(type)} ${type.replace(/_/g, ' ')}`).includes(normalize(query)));
  const categories = ['all', ...moduleCategories] as const;
  const categoryName = (key: typeof categories[number]) => t(key === 'all' ? 'studio.all' : `studio.categories.${key}`);
  const count = (key: typeof categories[number]) => available.filter((type) => key === 'all' || moduleDirectory[type].category === key).length;
  const changeCategory = (key: typeof categories[number]) => { setCategory(key); setQuery(''); };

  return (
    <main className='studio-directory'>
      <aside className='studio-directory-sidebar'>
        <p className='studio-eyebrow'>{t('studio.question')}</p>
        <nav className='studio-category-list' aria-label={t('studio.modules')}>
          {categories.map((key) => <button type='button' key={key} aria-pressed={!query && category === key}
            onClick={() => changeCategory(key)} disabled={count(key) === 0}>
            <ModuleIcon name={key} /><span>{categoryName(key)}</span><small>{count(key)}</small>
          </button>)}
        </nav>
        <div className='studio-current'>
          <p className='studio-eyebrow'>{t('studio.current')}</p><strong>{name(active)}</strong>
          <button type='button' className='studio-button' onClick={onResume}>{t('studio.resume')}<ArrowUpRight size={15} /></button>
        </div>
      </aside>
      <section className='studio-collection'>
        <div className='studio-mobile-category'><label>{t('studio.modules')}<select value={category} onChange={(e) => changeCategory(e.target.value as typeof category)}>
          {categories.map((key) => <option key={key} value={key} disabled={count(key) === 0}>{categoryName(key)} · {count(key)}</option>)}
        </select></label></div>
        <header className='studio-collection-heading'>
          <div><p className='studio-eyebrow'>{t('studio.collection')}</p><h1>{t(query ? 'studio.searchTitle' : category === 'all' ? 'studio.collectionTitle' : `studio.headings.${category}`)}</h1></div>
          <div className='studio-search'><Search size={17} aria-hidden='true' /><input aria-label={t('studio.search', { count: available.length })}
            placeholder={t('studio.search', { count: available.length })} value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && <button type='button' onClick={() => setQuery('')} aria-label={t('studio.clear')}><X size={16} /></button>}
          </div>
        </header>
        <div className='studio-collection-meta' aria-live='polite'><span>{t('studio.results', { count: matching.length })}</span><span>{t('studio.choose')}</span></div>
        <div className='studio-module-grid'>
          {matching.map((type) => {
            const entry = moduleDirectory[type];
            const InputIcon = entry.mode === 'create' ? Sparkles : entry.mode === 'image' ? ImageIcon : FileBox;
            return <button type='button' key={type} className='studio-module-card' aria-pressed={selected === type} onClick={() => setSelected(type)}
              onDoubleClick={() => !disabled && onOpen(type)}>
              <div className='studio-module-image'>
                {entry.thumbnail ? <img src={`${import.meta.env.BASE_URL}module-thumbnails/${entry.thumbnail}`} alt='' loading='lazy' width='768' height='768' />
                  : <div className='studio-module-symbol'><ModuleIcon name={entry.icon} size={38} /></div>}
              </div>
              <div className='studio-module-copy'><strong>{name(type)}</strong><span>{description(type)}</span><small><InputIcon size={13} aria-hidden='true' />{t(`studio.inputs.${entry.mode}`)}</small></div>
            </button>;
          })}
        </div>
        {matching.length === 0 && <div className='studio-empty-search'><Search size={26} /><p>{t('studio.noResults')}</p><button className='studio-button' onClick={() => setQuery('')}>{t('studio.clear')}</button></div>}
        <div className='studio-selection'>
          <ModuleIcon name={moduleDirectory[selected].icon} size={23} />
          <div><strong>{name(selected)}</strong><p>{description(selected)}</p></div>
          <button type='button' className='studio-button studio-button-primary' disabled={disabled} onClick={() => onOpen(selected)}>{t('studio.open')}<ArrowRight size={16} /></button>
        </div>
      </section>
    </main>
  );
}
