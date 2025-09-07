const SUPPORTED_LANGUAGES = ['cs', 'en', 'de', 'fr', 'es', 'ru', 'uk'];
const I18N_DEFAULT = 'en'; // fallback, pokud není jazyk podporován
let i18nData = {};
let i18nReady = false;
let currentLang = I18N_DEFAULT;

function detectBrowserLang() {
    const navLangs = navigator.languages || [navigator.language || navigator.userLanguage || 'en'];
    for (let langRaw of navLangs) {
        let lang = (langRaw || '').split('-')[0].toLowerCase();
        if (SUPPORTED_LANGUAGES.includes(lang)) return lang;
    }
    return I18N_DEFAULT;
}

function getSavedLang() {
    try {
        return localStorage.getItem('selectedLang') || null;
    } catch (e) { return null; }
}

function setSavedLang(lang) {
    try {
        localStorage.setItem('selectedLang', lang);
    } catch (e) {}
}

function getLang() {
    // 1. Volba uživatele
    let saved = getSavedLang();
    if (saved && SUPPORTED_LANGUAGES.includes(saved)) return saved;
    // 2. Jazyk prohlížeče
    let detected = detectBrowserLang();
    return detected;
}

// Funkce pro vyčištění JSON dat od komentářů a metadata
function cleanI18nData(rawData) {
    const cleanData = {};
    for (const key in rawData) {
        // Ignorovat klíče začínající _ (komentáře a metadata)
        if (!key.startsWith('_')) {
            cleanData[key] = rawData[key];
        }
    }
    return cleanData;
}

// Dynamické načtení JSON překladů
async function loadI18n(lang) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) lang = I18N_DEFAULT;
    
    // Pokus o načtení z cache
    if (window.i18nDataCache && window.i18nDataCache[lang]) {
        i18nData = cleanI18nData(window.i18nDataCache[lang]);
        i18nReady = true;
        return i18nData;
    }
    
    try {
        // Cesta zůstává: ./i18n/{lang}.json
        const resp = await fetch(`./i18n/${lang}.json`);
        if (!resp.ok) throw new Error(`Failed to load language ${lang}: ${resp.status}`);
        const rawData = await resp.json();
        
        // Vyčistit data od komentářů
        i18nData = cleanI18nData(rawData);
        
        // Uložit do cache (včetně komentářů pro případné další použití)
        window.i18nDataCache = window.i18nDataCache || {};
        window.i18nDataCache[lang] = rawData;
        
        i18nReady = true;
        console.log(`Language ${lang} loaded successfully (${Object.keys(i18nData).length} keys)`);
        return i18nData;
    } catch (e) {
        console.error(`Failed to load language ${lang}:`, e);
        
        // Fallback na výchozí jazyk
        if (lang !== I18N_DEFAULT) {
            console.log(`Falling back to default language: ${I18N_DEFAULT}`);
            return loadI18n(I18N_DEFAULT);
        }
        
        // Nouzový fallback s základními překlady v angličtině
        console.warn("Using emergency fallback translations");
        i18nData = {
            app_title: "Calendar Calculator",
            calculating: "Calculating...",
            calculation_error: "❌ Calculation error",
            invalid_date: "Invalid date format"
        };
        i18nReady = true;
        return i18nData;
    }
}

// Optimalizovaná funkce pro překlad s lepším error handlingem
function i18n(key, vars = {}) {
    if (!i18nReady || !i18nData) {
        console.warn(`i18n not ready yet for key: ${key}`);
        return `[${key}]`; // Místo chybové hlášky vrátí klíč v hranatých závorkách
    }
    
    let val = i18nData[key];
    if (val === undefined) {
        console.warn(`Missing translation key: ${key} for language: ${currentLang}`);
        return `[${key}]`; // Místo chybové hlášky vrátí klíč
    }
    
    // Jednoduchá podpora proměnných ve tvaru {var}
    Object.keys(vars).forEach(k => {
        val = val.replace(new RegExp(`{${k}}`, 'g'), vars[k]);
    });
    return val;
}

// Optimalizovaná funkce pro získání názvu dne v týdnu
function getWeekdayName(dayIndex, lowercase = false) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const key = lowercase ? `${days[dayIndex]}_lc` : days[dayIndex];
    return i18n(key);
}

// Optimalizovaná funkce pro získání názvu měsíce
function getMonthName(monthIndex) {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                   'july', 'august', 'september', 'october', 'november', 'december'];
    return i18n(months[monthIndex - 1]);
}

// Nová pomocná funkce pro planety
function getPlanetName(planetKey) {
    const planets = {
        'mercury': 'mercury',
        'venus': 'venus', 
        'mars': 'mars',
        'jupiter': 'jupiter',
        'saturn': 'saturn'
    };
    return i18n(planets[planetKey] || 'mercury');
}

// Nová pomocná funkce pro souhvězdí
function getConstellationName(longitude) {
    const constellations = [
        {start: 0, end: 30, key: 'aries'},
        {start: 30, end: 60, key: 'taurus'},
        {start: 60, end: 90, key: 'gemini'},
        {start: 90, end: 120, key: 'cancer'},
        {start: 120, end: 150, key: 'leo'},
        {start: 150, end: 180, key: 'virgo'},
        {start: 180, end: 210, key: 'libra'},
        {start: 210, end: 240, key: 'scorpio'},
        {start: 240, end: 270, key: 'sagittarius'},
        {start: 270, end: 300, key: 'capricorn'},
        {start: 300, end: 330, key: 'aquarius'},
        {start: 330, end: 360, key: 'pisces'}
    ];

    for (let i = 0; i < constellations.length; i++) {
        if (longitude >= constellations[i].start && longitude < constellations[i].end) {
            return i18n(constellations[i].key);
        }
    }
    return i18n('pisces');
}

// Nová pomocná funkce pro fáze Měsíce
function getMoonPhaseName(age) {
    if (age < 1.84566) return i18n("moon_new");
    else if (age < 5.53699) return i18n("moon_waxing_crescent");
    else if (age < 9.22831) return i18n("moon_first_quarter");
    else if (age < 12.91963) return i18n("moon_waxing_gibbous");
    else if (age < 16.61096) return i18n("moon_full");
    else if (age < 20.30228) return i18n("moon_waning_gibbous");
    else if (age < 23.99361) return i18n("moon_last_quarter");
    else if (age < 27.68493) return i18n("moon_waning_crescent");
    else return i18n("moon_new");
}

// Vylepšené funkce changeLang s lepším error handlingem
async function changeLang(lang) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
        console.warn(`Unsupported language: ${lang}, using default: ${I18N_DEFAULT}`);
        lang = I18N_DEFAULT;
    }
    
    try {
        await loadI18n(lang);
        currentLang = lang;
        setSavedLang(lang);
        
        // Po načtení překladů obnovit texty v UI
        updateI18nUI();
        
        // Aktualizujte Service Worker o změně jazyka
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'LANGUAGE_CHANGED',
                language: lang
            });
        }
        
        console.log(`Language changed to: ${lang}`);
        
    } catch (error) {
        console.error('Error changing language:', error);
        // Pokus o návrat k výchozímu jazyku
        if (lang !== I18N_DEFAULT) {
            console.log('Attempting fallback to default language');
            return changeLang(I18N_DEFAULT);
        }
    }
}

// Pro inicializaci na začátku aplikace
async function initI18n() {
    let lang = getLang();
    await loadI18n(lang);
    currentLang = lang;
    i18nReady = true;
    setSavedLang(lang);
    updateI18nUI();
    
    // Debug informace
    console.log('i18n initialized successfully');
    console.log(`Language: ${currentLang}, Keys: ${Object.keys(i18nData).length}`);
}

// Optimalizovaná funkce pro update celého UI
function updateI18nUI() {
    // Základní data-i18n atributy
    document.querySelectorAll('[data-i18n]').forEach(el => {
        let key = el.getAttribute('data-i18n');
        if (key) el.innerHTML = i18n(key);
    });
    
    // Placeholder texty
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        let key = el.getAttribute('data-i18n-placeholder');
        if (key) el.setAttribute('placeholder', i18n(key));
    });
    
    // Title atributy
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        let key = el.getAttribute('data-i18n-title');
        if (key) el.setAttribute('title', i18n(key));
    });
    
    // Hodnoty tlačítek
    document.querySelectorAll('[data-i18n-value]').forEach(el => {
        let key = el.getAttribute('data-i18n-value');
        if (key) el.value = i18n(key);
    });
    
    // Textové obsahy tlačítek
    document.querySelectorAll('button[data-i18n-content]').forEach(el => {
        let key = el.getAttribute('data-i18n-content');
        if (key) el.textContent = i18n(key);
    });

    // Alt atributy
    document.querySelectorAll('[data-i18n-alt]').forEach(el => {
        let key = el.getAttribute('data-i18n-alt');
        if (key) el.setAttribute('alt', i18n(key));
    });

    // Label elementy
    document.querySelectorAll('label[data-i18n-label]').forEach(el => {
        let key = el.getAttribute('data-i18n-label');
        if (key) el.textContent = i18n(key);
    });

    // Select options - speciální handling
    document.querySelectorAll('option[data-i18n]').forEach(el => {
        let key = el.getAttribute('data-i18n');
        if (key) el.textContent = i18n(key);
    });

    // Update meta tag pro PWA
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) {
        appleTitle.setAttribute('content', i18n('app_title'));
    }

    // Update document title pokud potřeba
    if (document.title === 'Kalendářní kalkulátor' || document.title === 'Calendar Calculator') {
        document.title = i18n('app_title');
    }

    console.log('UI updated with current language:', currentLang);
}

// Debug funkce pro kontrolu načtených klíčů
function debugI18n() {
    console.log('=== i18n Debug Info ===');
    console.log('Current language:', currentLang);
    console.log('i18n ready:', i18nReady);
    console.log('Available keys:', Object.keys(i18nData).length);
    console.log('Sample keys:', Object.keys(i18nData).slice(0, 10));
    
    // Test několika klíčů
    console.log('Test translations:');
    console.log('- app_title:', i18n('app_title'));
    console.log('- monday:', i18n('monday'));
    console.log('- january:', i18n('january'));
    console.log('- calculating:', i18n('calculating'));
    console.log('======================');
}

// Export pro použití v hlavním skriptu
window.i18n = i18n;
window.changeLang = changeLang;
window.initI18n = initI18n;
window.updateI18nUI = updateI18nUI;
window.getLang = getLang;
window.getWeekdayName = getWeekdayName;
window.getMonthName = getMonthName;
window.getPlanetName = getPlanetName;
window.getConstellationName = getConstellationName;
window.getMoonPhaseName = getMoonPhaseName;
window.SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;
window.debugI18n = debugI18n;
window.i18nReady = () => i18nReady;
window.currentLang = () => currentLang;