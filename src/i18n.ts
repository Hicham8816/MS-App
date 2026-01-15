const KEY = 'ps_lang';

type Lang = 'de' | 'en' | 'fr';
type Dict = Record<string, Record<Lang, string>>;

const dict: Dict = {
  appTitle: { de: 'PrintShop', en: 'PrintShop', fr: 'PrintShop' },
  login: { de: 'Login', en: 'Login', fr: 'Connexion' },
  register: { de: 'Registrieren', en: 'Register', fr: 'Créer un compte' },
  username: { de: 'Benutzername', en: 'Username', fr: "Nom d'utilisateur" },
  password: { de: 'Passwort', en: 'Password', fr: 'Mot de passe' },
  logout: { de: 'Abmelden', en: 'Logout', fr: 'Déconnexion' },
  blockedMsg: {
    de: 'bitte beim Admin sich entsperren lassen!!',
    en: 'please ask admin to unblock you!!',
    fr: "veuillez demander à l’admin de vous débloquer !!"
  },
  settings: { de: 'Einstellungen', en: 'Settings', fr: 'Paramètres' },
  products: { de: 'Produkte', en: 'Products', fr: 'Produits' },
  pricing: { de: 'Pricing', en: 'Pricing', fr: 'Tarification' },
  codes: { de: 'Codes', en: 'Codes', fr: 'Codes' },
  structure: { de: 'Struktur', en: 'Structure', fr: 'Structure' }
};

let lang: Lang = (localStorage.getItem(KEY) as Lang) || 'de';

export function t(key: keyof typeof dict) {
  return dict[key]?.[lang] || key;
}
export function getLang(): Lang {
  return lang;
}
export function setLang(l: Lang) {
  lang = l;
  localStorage.setItem(KEY, l);
  window.dispatchEvent(new Event('ps_lang_changed'));
}
