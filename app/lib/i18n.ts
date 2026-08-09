'use client';

import { useEffect, useState } from 'react';

// Step 22 — Hindi UI Toggle
//
// Only UI chrome gets translated here (nav, headers, buttons, placeholders).
// Never translates: novel/chapter content, series titles, synopses, usernames,
// or anything a creator typed — that's user content, not UI copy, and per
// Step 21's language field, a creator's own language choice is independent
// of whatever UI language a reader has selected.
//
// Add more languages later (Tamil, Telugu, Bengali) by adding another key
// to TRANSLATIONS and to the LANGUAGES list below — everything else (the
// hook, localStorage persistence, t() lookup) already supports N languages.

export type UiLanguage = 'en' | 'hi';

export const LANGUAGES: { code: UiLanguage; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'हिं' },
];

const STORAGE_KEY = 'mangal_ui_language';

const TRANSLATIONS: Record<UiLanguage, Record<string, string>> = {
  en: {
    browse: 'Browse',
    genres: 'Genres',
    newReleases: 'New Releases',
    library: '🔔 Library',
    studio: '🛠 Studio',
    logIn: 'Log in',
    getStarted: 'Get Started',
    heroTag: "INDIA'S COMIC PLATFORM",
    heroTitleWhite: 'Bharat Ki',
    heroTitleOrange: 'Kahaniyan',
    heroSubtitle: 'Discover Mangal-style stories made by Indian creators. Free to read, forever.',
    searchPlaceholder: 'Search series, genres, creators...',
    continueReading: '▶ Continue Reading',
    trendingThisWeek: '📈 Trending This Week',
    newArrivals: '🆕 New Arrivals',
    staffPicks: '⭐ Staff Picks',
    // Content-type & genre pills, remaining section headers (Step 22 cont'd)
    ctAll: '✨ All',
    ctMangal: '📖 Mangal',
    ctNovel: '📕 Novel',
    desiComics: 'Desi Comics',
    genreAll: 'All',
    genreAction: 'Action',
    genreRomance: 'Romance',
    genreFantasy: 'Fantasy',
    genreComedy: 'Comedy',
    genreDrama: 'Drama',
    genreHorror: 'Horror',
    genreSliceOfLife: 'Slice of Life',
    genreSciFi: 'Sci-Fi',
    genreThriller: 'Thriller',
    genreMythology: 'Mythology',
    genreFolkTale: 'Folk Tale',
    genreDesiHorror: 'Desi Horror',
    genreStreetLife: 'Street Life',
    genreSchoolLife: 'School Life',
    genreIndependenceEra: 'Independence Era',
    noSeriesInFilter: 'No series found for this filter yet.',
    featured: '🔥 Featured',
    seriesTotal: 'series total',
    allSeries: '📚 All Series',
    genreSeriesSuffix: 'Series',
    loadingStories: 'Loading stories...',
    // ProfileMenu dropdown
    roleCreator: 'Creator',
    roleReader: 'Reader',
    roleDeveloper: 'Developer',
    pmDashboard: '🛠️ Dashboard',
    pmReaderView: '📖 Reader View',
    pmCreateNewSeries: '➕ Create New Series',
    pmReadingHistory: '🕘 Reading History',
    pmBookmarks: '🔖 Bookmarks',
    pmAdminReports: '🚩 Admin Reports',
    pmBecomeCreator: '✨ Become a Creator',
    pmSettings: '⚙️ Settings',
    pmSignOut: '⏻ Sign Out',
    // Settings page (Step 19/22) — DPDP account controls
    backToHome: '← Back to Home',
    settingsTitle: 'Account & Data Settings',
    settingsIntro: 'Controls described in our',
    settingsIntroLink: 'Privacy Policy',
    settingsIntroSuffix: ', under \u201cYour Rights as a Data Principal.\u201d',
    downloadDataTitle: '📥 Download My Data',
    downloadDataBody: 'Get a JSON file containing your account info, reading progress, follows, comments, reactions, ratings, and (if applicable) your published series and creator profile. Payout details are excluded — email our Grievance Officer if you specifically need those.',
    downloadDataBtn: 'Download My Data',
    downloadDataPreparing: 'Preparing…',
    genericErrorRetryEmail: 'Something went wrong. Please try again, or email us directly.',
    withdrawConsentTitle: '🔓 Withdraw Consent',
    withdrawConsentBody: 'Withdraw your consent for data processing at any time, as easily as you gave it. This logs your withdrawal and stops new optional processing going forward — it does not undo processing already carried out, and core account functions (like staying logged in) may stop working without basic processing, since some data use is necessary to run the service itself.',
    withdrawConsentBtn: 'Withdraw Consent',
    withdrawConsentDone: '✓ Consent withdrawn',
    withdrawConsentInProgress: 'Withdrawing…',
    genericErrorRetry: 'Something went wrong. Please try again.',
    deleteAccountTitle: '🗑️ Delete My Account',
    deleteAccountBodyPart1: 'This permanently deletes your profile, avatar, reading history, follows, comments, ratings, and reactions immediately. Your account-creation timestamp and registration IP are retained separately for 180 days, as required by IT Rules 2021, then automatically erased — see our',
    deleteAccountBodyPart2: 'for the full breakdown. This cannot be undone.',
    privacyPolicyLink: 'Privacy Policy',
    deleteAccountBtn: 'Delete My Account',
    deleteAccountConfirmQ: 'Are you sure? This is permanent and cannot be reversed.',
    deleteAccountConfirmYes: 'Yes, permanently delete my account',
    deleteAccountCancel: 'Cancel',
    deleteAccountDeleting: 'Deleting your account…',
    deleteAccountDone: '✓ Your account has been deleted. Redirecting you home…',
    deleteAccountErrorPrefix: 'Please try again, or email our',
    grievanceOfficerLink: 'Grievance Officer',
    deleteAccountBack: 'Back',
    somethingWentWrong: 'Something went wrong.',
    // Dashboard
    readerView: '📖 Reader View',
    dashboard: '🛠️ Dashboard',
    createNew: '➕ Create New',
    engineVersion: 'MANGAL ENGINE V1.0',
    myCreatorDashboard: 'My Creator Dashboard',
    manageSeriesIntro: "Manage the series you've published. Want to start something new?",
    createNewArrow: 'Create New →',
    tabMySeries: '📚 My Series',
    tabAnalytics: '📊 Analytics',
    mySeriesCount: '📚 My Series',
    loadingSeries: 'Loading your series...',
    noSeriesYet: "You haven't created any series yet.",
    createFirstSeries: '🚀 Create Your First Series',
    view: 'View',
    addChapter: '+ Chapter',
    confirmQ: 'Confirm?',
    cancel: 'Cancel',
    deleteChapter: '🗑️ Delete Chapter',
    managePages: '📄 Manage Pages',
    noChaptersYet: 'No chapters yet.',
    analyticsTitle: '📊 Analytics',
    crunchingNumbers: 'Crunching your numbers...',
    noDataYet: 'No data yet.',
    viewsPerSeries: 'Views Per Series',
    noSeriesYetShort: 'No series yet.',
    totalViews: 'Total Views',
    totalFollowers: 'Total Followers',
    newFollowers7d: 'New Followers (7d)',
    totalComments: 'Total Comments',
    totalChapters: 'Chapters',
    totalWords: 'Words',
    selectedSeries: 'Series',
    views: 'Views',
    viewsPerChapterNote: "Views per chapter (last 30 days) isn't tracked yet — view counts currently only fire on the series page, not per chapter in the reader. Needs a small migration + a hook in the reader view to light up.",
    forCreatorsTitle: 'This Page Is For Creators',
    forCreatorsBody: 'The Dashboard is where creators manage their series. As a reader, your home is the library — browse and keep reading.',
    backToReading: '← Back to Reading',
    madeWithLove: 'Made with ❤️ in India · Free to read, forever.',
    privacyPolicy: 'Privacy Policy',
    termsOfService: 'Terms of Service',
    grievanceOfficer: 'Grievance Officer',
  },
  hi: {
    browse: 'ब्राउज़ करें',
    genres: 'श्रेणियाँ',
    newReleases: 'नई रिलीज़',
    library: '🔔 लाइब्रेरी',
    studio: '🛠 स्टूडियो',
    logIn: 'लॉग इन',
    getStarted: 'शुरू करें',
    heroTag: 'भारत का कॉमिक प्लेटफ़ॉर्म',
    heroTitleWhite: 'भारत की',
    heroTitleOrange: 'कहानियाँ',
    heroSubtitle: 'भारतीय रचनाकारों की मंगल-स्टाइल कहानियाँ खोजें। पढ़ना हमेशा मुफ़्त।',
    searchPlaceholder: 'सीरीज़, श्रेणी, क्रिएटर खोजें...',
    continueReading: '▶ पढ़ना जारी रखें',
    trendingThisWeek: '📈 इस हफ़्ते ट्रेंडिंग',
    newArrivals: '🆕 नई कहानियाँ',
    staffPicks: '⭐ टीम की पसंद',
    // Content-type & genre pills, remaining section headers (Step 22 cont'd)
    ctAll: '✨ सभी',
    ctMangal: '📖 मंगल',
    ctNovel: '📕 उपन्यास',
    desiComics: 'देसी कॉमिक्स',
    genreAll: 'सभी',
    genreAction: 'एक्शन',
    genreRomance: 'रोमांस',
    genreFantasy: 'फैंटेसी',
    genreComedy: 'कॉमेडी',
    genreDrama: 'ड्रामा',
    genreHorror: 'हॉरर',
    genreSliceOfLife: 'स्लाइस ऑफ़ लाइफ़',
    genreSciFi: 'साई-फाई',
    genreThriller: 'थ्रिलर',
    genreMythology: 'पौराणिक',
    genreFolkTale: 'लोक कथा',
    genreDesiHorror: 'देसी हॉरर',
    genreStreetLife: 'गली-मोहल्ला जीवन',
    genreSchoolLife: 'स्कूल लाइफ़',
    genreIndependenceEra: 'स्वतंत्रता युग',
    noSeriesInFilter: 'इस फ़िल्टर के लिए अभी कोई सीरीज़ नहीं मिली।',
    featured: '🔥 फ़ीचर्ड',
    seriesTotal: 'सीरीज़ कुल',
    allSeries: '📚 सभी सीरीज़',
    genreSeriesSuffix: 'सीरीज़',
    loadingStories: 'कहानियाँ लोड हो रही हैं...',
    // ProfileMenu dropdown
    roleCreator: 'क्रिएटर',
    roleReader: 'रीडर',
    roleDeveloper: 'डेवलपर',
    pmDashboard: '🛠️ डैशबोर्ड',
    pmReaderView: '📖 रीडर व्यू',
    pmCreateNewSeries: '➕ नई सीरीज़ बनाएं',
    pmReadingHistory: '🕘 पढ़ने का इतिहास',
    pmBookmarks: '🔖 बुकमार्क्स',
    pmAdminReports: '🚩 एडमिन रिपोर्ट्स',
    pmBecomeCreator: '✨ क्रिएटर बनें',
    pmSettings: '⚙️ सेटिंग्स',
    pmSignOut: '⏻ साइन आउट',
    // Settings page (Step 19/22) — DPDP account controls
    backToHome: '← होम पर वापस जाएं',
    settingsTitle: 'अकाउंट और डेटा सेटिंग्स',
    settingsIntro: 'ये नियंत्रण हमारी',
    settingsIntroLink: 'प्राइवेसी पॉलिसी',
    settingsIntroSuffix: ' में बताए गए हैं, “Your Rights as a Data Principal” सेक्शन के अंतर्गत।',
    downloadDataTitle: '📥 अपना डेटा डाउनलोड करें',
    downloadDataBody: 'अपनी अकाउंट जानकारी, पढ़ने की प्रगति, फॉलो, कमेंट्स, रिएक्शन, रेटिंग्स, और (यदि लागू हो) अपनी प्रकाशित सीरीज़ व क्रिएटर प्रोफ़ाइल वाली एक JSON फ़ाइल पाएं। पेआउट विवरण शामिल नहीं हैं — यदि आपको वे चाहिए तो हमारे ग्रीवांस ऑफ़िसर को ईमेल करें।',
    downloadDataBtn: 'अपना डेटा डाउनलोड करें',
    downloadDataPreparing: 'तैयार किया जा रहा है…',
    genericErrorRetryEmail: 'कुछ गलत हो गया। कृपया फिर से कोशिश करें, या हमें सीधे ईमेल करें।',
    withdrawConsentTitle: '🔓 सहमति वापस लें',
    withdrawConsentBody: 'अपनी डेटा प्रोसेसिंग सहमति कभी भी वापस लें, जितनी आसानी से आपने दी थी। इससे आपकी वापसी दर्ज हो जाती है और आगे की वैकल्पिक प्रोसेसिंग रुक जाती है — यह पहले से की गई प्रोसेसिंग को पूर्ववत नहीं करता, और बेसिक प्रोसेसिंग के बिना अकाउंट के मुख्य कार्य (जैसे लॉग-इन बने रहना) काम करना बंद कर सकते हैं, क्योंकि सेवा चलाने के लिए कुछ डेटा उपयोग आवश्यक है।',
    withdrawConsentBtn: 'सहमति वापस लें',
    withdrawConsentDone: '✓ सहमति वापस ले ली गई',
    withdrawConsentInProgress: 'वापस ली जा रही है…',
    genericErrorRetry: 'कुछ गलत हो गया। कृपया फिर से कोशिश करें।',
    deleteAccountTitle: '🗑️ मेरा अकाउंट डिलीट करें',
    deleteAccountBodyPart1: 'इससे आपकी प्रोफ़ाइल, अवतार, पढ़ने का इतिहास, फॉलो, कमेंट्स, रेटिंग्स, और रिएक्शन तुरंत स्थायी रूप से डिलीट हो जाते हैं। आपका अकाउंट-निर्माण टाइमस्टैम्प और रजिस्ट्रेशन IP, IT Rules 2021 के अनुसार, अलग से 180 दिनों तक रखे जाते हैं, फिर स्वतः मिटा दिए जाते हैं — पूरी जानकारी के लिए हमारी',
    deleteAccountBodyPart2: 'देखें। इसे पूर्ववत नहीं किया जा सकता।',
    privacyPolicyLink: 'प्राइवेसी पॉलिसी',
    deleteAccountBtn: 'मेरा अकाउंट डिलीट करें',
    deleteAccountConfirmQ: 'क्या आप वाकई निश्चित हैं? यह स्थायी है और इसे वापस नहीं किया जा सकता।',
    deleteAccountConfirmYes: 'हाँ, मेरा अकाउंट स्थायी रूप से डिलीट करें',
    deleteAccountCancel: 'रद्द करें',
    deleteAccountDeleting: 'आपका अकाउंट डिलीट किया जा रहा है…',
    deleteAccountDone: '✓ आपका अकाउंट डिलीट कर दिया गया है। आपको होम पर भेजा जा रहा है…',
    deleteAccountErrorPrefix: 'कृपया फिर से कोशिश करें, या हमारे',
    grievanceOfficerLink: 'ग्रीवांस ऑफ़िसर',
    deleteAccountBack: 'वापस',
    somethingWentWrong: 'कुछ गलत हो गया।',
    // Dashboard
    readerView: '📖 रीडर व्यू',
    dashboard: '🛠️ डैशबोर्ड',
    createNew: '➕ नया बनाएं',
    engineVersion: 'मंगल इंजन v1.0',
    myCreatorDashboard: 'मेरा क्रिएटर डैशबोर्ड',
    manageSeriesIntro: 'अपनी प्रकाशित सीरीज़ मैनेज करें। कुछ नया शुरू करना चाहते हैं?',
    createNewArrow: 'नया बनाएं →',
    tabMySeries: '📚 मेरी सीरीज़',
    tabAnalytics: '📊 एनालिटिक्स',
    mySeriesCount: '📚 मेरी सीरीज़',
    loadingSeries: 'आपकी सीरीज़ लोड हो रही है...',
    noSeriesYet: 'आपने अभी तक कोई सीरीज़ नहीं बनाई है।',
    createFirstSeries: '🚀 अपनी पहली सीरीज़ बनाएं',
    view: 'देखें',
    addChapter: '+ चैप्टर',
    confirmQ: 'पुष्टि करें?',
    cancel: 'रद्द करें',
    deleteChapter: '🗑️ चैप्टर हटाएं',
    managePages: '📄 पेज मैनेज करें',
    noChaptersYet: 'अभी कोई चैप्टर नहीं है।',
    analyticsTitle: '📊 एनालिटिक्स',
    crunchingNumbers: 'आपके आंकड़े तैयार किए जा रहे हैं...',
    noDataYet: 'अभी कोई डेटा नहीं है।',
    viewsPerSeries: 'सीरीज़ के अनुसार व्यूज़',
    noSeriesYetShort: 'अभी कोई सीरीज़ नहीं है।',
    totalViews: 'कुल व्यूज़',
    totalFollowers: 'कुल फॉलोअर्स',
    newFollowers7d: 'नए फॉलोअर्स (7 दिन)',
    totalComments: 'कुल कमेंट्स',
    totalChapters: 'चैप्टर्स',
    totalWords: 'शब्द',
    selectedSeries: 'सीरीज़',
    views: 'व्यूज़',
    viewsPerChapterNote: 'चैप्टर के अनुसार व्यूज़ (पिछले 30 दिन) अभी ट्रैक नहीं हो रहे — व्यू काउंट अभी सिर्फ सीरीज़ पेज पर चलता है, रीडर में चैप्टर के हिसाब से नहीं। इसके लिए एक छोटा माइग्रेशन और रीडर व्यू में एक हुक चाहिए।',
    forCreatorsTitle: 'यह पेज सिर्फ क्रिएटर्स के लिए है',
    forCreatorsBody: 'डैशबोर्ड वह जगह है जहाँ क्रिएटर अपनी सीरीज़ मैनेज करते हैं। रीडर के तौर पर, आपकी जगह लाइब्रेरी है — ब्राउज़ करें और पढ़ते रहें।',
    backToReading: '← पढ़ने पर वापस जाएं',
    madeWithLove: 'भारत में ❤️ से बना · पढ़ना हमेशा मुफ़्त।',
    privacyPolicy: 'प्राइवेसी पॉलिसी',
    termsOfService: 'सेवा की शर्तें',
    grievanceOfficer: 'शिकायत अधिकारी',
  },
};

/**
 * Persisted UI-language preference + a t() lookup function.
 * Usage: const { lang, setLang, t } = useUiLanguage();  ...  {t('browse')}
 */
export function useUiLanguage() {
  const [lang, setLangState] = useState<UiLanguage>('en');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'hi') setLangState(saved);
    } catch {
      // localStorage unavailable (e.g. private mode) — silently fall back to English
    }
    setHydrated(true);
  }, []);

  const setLang = (next: UiLanguage) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore write failures, language just won't persist this session
    }
  };

  const t = (key: keyof typeof TRANSLATIONS['en']): string => {
    return TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key] ?? key;
  };

  return { lang, setLang, t, hydrated };
}