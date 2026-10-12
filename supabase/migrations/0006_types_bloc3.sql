-- ============================================================
-- 0006 — Types du moteur financier (bloc 3)
-- Valeurs d'énumération ajoutées seules : elles ne peuvent pas être
-- utilisées dans la transaction qui les crée (voir 0007).
-- ============================================================
alter type public.category_kind add value if not exists 'transfer';
alter type public.category_kind add value if not exists 'refund';
alter type public.category_kind add value if not exists 'review';

create type public.review_status as enum ('auto', 'confirmed', 'corrected');
create type public.extraction_method as enum ('text', 'ocr');
