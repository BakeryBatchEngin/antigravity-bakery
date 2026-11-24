/**
 * 商品名・商品コードの表記ゆれ吸収ユーティリティ
 * 
 * 全国の店舗から集まるエクセルには、以下のような多様な表記ゆれが存在します：
 * 1. 半角全角（英数字、カタカナ、カッコ、記号）
 * 2. カタカナ長音符（ー）とダッシュ・ハイフン（―、—、–、−、－、-）
 * 3. 波ダッシュ（〜）と全角チルダ（～）、半角チルダ（~）
 * 4. 空白（全角スペース、半角スペース、連続空白、不可視空白）
 * 5. カッコの有無（例:「チャバタ(大)」vs「チャバタ大」）
 * 
 * これらを多段階で正規化し、一致率を極限まで高めます。
 */

// 長音記号、ダッシュ、各種ハイフン・マイナスを表す正規表現
const DASH_LONG_VOWEL_REGEX = /[\u2010-\u2015\u2212\uFF0D\u30FC\-]/g;

// 波ダッシュ、全角チルダ、半角チルダを表す正規表現
const TILDE_REGEX = /[\u301C\uFF5E\u007E]/g;

// 各種空白（全角、半角、改行、タブ、ノーブレークスペース、ゼロ幅スペース）を表す正規表現
const WHITESPACE_REGEX = /[\s\u00A0\u200B\uFEFF]+/g;

// カッコ記号（全角・半角・角括弧・隅付き括弧など）を表す正規表現
const BRACKETS_REGEX = /[()\[\]{}（）〔〕【】「」『』〈〉《》]/g;

/**
 * 商品名・コードを強力に正規化します。
 * - NFKC正規化（半角カナ→全角、全角英数→半角、全角記号→半角）
 * - ハイフン・長音記号・ダッシュ類をカタカナ長音符「ー」に統一
 * - 波ダッシュ・チルダ類を「~」に統一
 * - 空白・制御文字を完全除去
 * - 小文字化
 */
export function normalizeProductName(name: string | null | undefined): string {
  if (!name) return '';

  return String(name)
    .normalize('NFKC')
    .replace(DASH_LONG_VOWEL_REGEX, 'ー')
    .replace(TILDE_REGEX, '~')
    .replace(WHITESPACE_REGEX, '')
    .toLowerCase();
}

/**
 * 括弧などの記号を除去したフォールバック用キーを生成します。
 * 例: "チャバタ(大)" -> "チャバタ大"
 *     "デニッシュ・マロン" -> "デニッシュマロン"
 */
export function normalizeWithoutPunctuation(name: string | null | undefined): string {
  const norm = normalizeProductName(name);
  if (!norm) return '';

  return norm
    .replace(BRACKETS_REGEX, '')
    .replace(/[・\.\,\/_\:;\*\+\=\|]/g, '');
}

/**
 * 2つの商品名が表記ゆれを考慮して実質的に一致しているかを判定します。
 */
export function isProductNameMatch(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  if (name1 === name2) return true;

  const n1 = normalizeProductName(name1);
  const n2 = normalizeProductName(name2);
  if (n1 && n1 === n2) return true;

  const p1 = normalizeWithoutPunctuation(name1);
  const p2 = normalizeWithoutPunctuation(name2);
  if (p1 && p1 === p2) return true;

  return false;
}
