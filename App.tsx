
import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Heart, 
  Menu, 
  X, 
  ChevronRight, 
  PhoneCall,
  Languages,
  MessageCircle,
  Syringe,
  Bell,
  CheckCircle2,
  MapPin,
  AlertTriangle,
  Calendar,
  Clock,
  Navigation,
  Mic,
  MicOff,
  Image as ImageIcon,
  History,
  FileText,
  ChevronLeft,
  RefreshCw,
  Info,
  Sparkles,
  Wand2,
  ListRestart,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { LANGUAGES, UI_STRINGS } from './constants';
import { Language, Message, Role, View, UserLocation, LanguageHistory } from './types';
import { getHealthAdvice, translateInput } from './services/geminiService';

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>('en');
  const [hasStarted, setHasStarted] = useState(false);
  const [currentView, setCurrentView] = useState<View>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [allHistory, setAllHistory] = useState<LanguageHistory>({});
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [viewingHistoryLang, setViewingHistoryLang] = useState<Language | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  const [isTranslatingInput, setIsTranslatingInput] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ data: string, mimeType: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [birthDate, setBirthDate] = useState<string>('');
  const [ageInfo, setAgeInfo] = useState<{ weeks: number, months: number, years: number } | null>(null);

  const lastProcessedTranslate = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const strings = UI_STRINGS[language as keyof typeof UI_STRINGS] || UI_STRINGS.en;

  const scrollToBottom = () => {
    if (currentView === 'chat') {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, currentView]);

  // Automatic Translation Debounce
  useEffect(() => {
    if (language === 'en' || !inputValue || inputValue.length < 3) return;
    if (inputValue === lastProcessedTranslate.current) return;

    const timer = setTimeout(async () => {
      setIsTranslatingInput(true);
      try {
        const translated = await translateInput(inputValue, language);
        if (translated && translated !== inputValue) {
          lastProcessedTranslate.current = translated;
          setInputValue(translated);
        }
      } catch (err) {
        console.error("Auto-translate error", err);
      } finally {
        setIsTranslatingInput(false);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [inputValue, language]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputValue(prev => prev + (prev ? ' ' : '') + transcript);
        setIsRecording(false);
      };
      recognitionRef.current.onend = () => setIsRecording(false);
    }
  }, []);

  useEffect(() => {
    if (birthDate) {
      const birth = new Date(birthDate);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - birth.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setAgeInfo({ 
        weeks: Math.floor(diffDays / 7), 
        months: Math.floor(diffDays / 30.44), 
        years: Math.floor(diffDays / 365.25) 
      });
    } else {
      setAgeInfo(null);
    }
  }, [birthDate]);

  const addMessage = (role: Role, content: string, targetLang: Language, links: { title: string; uri: string }[] = [], img?: string, isError?: boolean, retryPrompt?: string) => {
    const newMessage: Message = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      role,
      content,
      timestamp: new Date(),
      groundingLinks: links,
      image: img,
      isError,
      retryPrompt
    };
    
    setMessages(prev => {
      const updated = [...prev, newMessage];
      setAllHistory(all => ({ ...all, [targetLang]: updated }));
      return updated;
    });
  };

  const handleStart = (newLang: Language) => {
    setLanguage(newLang);
    setHasStarted(true);
    setViewingHistoryLang(null);
    const existing = allHistory[newLang];
    if (existing && existing.length > 0) {
      setMessages(existing);
    } else {
      setMessages([{
        id: 'welcome-' + Date.now(),
        role: 'model',
        content: UI_STRINGS[newLang as keyof typeof UI_STRINGS]?.welcome || UI_STRINGS.en.welcome,
        timestamp: new Date()
      }]);
    }
  };

  const restoreHistory = (lang: Language) => {
    const history = allHistory[lang] || [];
    if (history.length > 0) {
      setMessages(history);
      setLanguage(lang);
      setViewingHistoryLang(null);
      setShowHistoryModal(false);
    }
  };

  const handleManualTranslate = async () => {
    if (!inputValue || inputValue.length < 2) return;
    setIsTranslatingInput(true);
    try {
      const translated = await translateInput(inputValue, language);
      if (translated) {
        lastProcessedTranslate.current = translated;
        setInputValue(translated);
      }
    } catch (e) {
      console.error("Manual translation failed");
    } finally {
      setIsTranslatingInput(false);
    }
  };

  const handleSendMessage = async (text: string, isRetry = false) => {
    const promptText = text.trim();
    if (!promptText && !selectedImage) return;

    if (currentView !== 'chat') setCurrentView('chat');
    setViewingHistoryLang(null);

    const currentImg = selectedImage;
    const currentPreview = imagePreview;

    if (!isRetry) {
      addMessage('user', promptText || strings.reportAnalysis, language, [], currentPreview || undefined);
    }
    
    setInputValue('');
    setSelectedImage(null);
    setImagePreview(null);
    setIsTyping(true);

    try {
      const result = await getHealthAdvice(promptText || strings.reportAnalysis, language, location, currentImg);
      addMessage('model', result.text, language, result.groundingLinks, undefined, result.isError, result.isError ? (promptText || strings.reportAnalysis) : undefined);
    } catch (e: any) {
      console.error("Send Message Error:", e);
      addMessage('model', "Sorry, I am having trouble responding. Please check your internet or try again.", language, [], undefined, true, promptText);
    } finally {
      setIsTyping(false);
    }
  };

  const clearChat = () => {
    const welcome = [{
      id: 'welcome-' + Date.now(),
      role: 'model',
      content: strings.welcome,
      timestamp: new Date()
    }];
    setMessages(welcome);
    setAllHistory(all => ({ ...all, [language]: welcome }));
    setShowSidebar(false);
  };

  const toggleRecording = () => {
    if (isRecording) recognitionRef.current?.stop();
    else if (recognitionRef.current) {
      const langMap: Record<string, string> = { 'en': 'en-US', 'hi': 'hi-IN', 'mr': 'mr-IN', 'bn': 'bn-IN', 'te': 'te-IN' };
      recognitionRef.current.lang = langMap[language] || 'en-US';
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage({ data: (reader.result as string).split(',')[1], mimeType: file.type });
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const requestLocation = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { 
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); 
        setIsLocating(false); 
      },
      () => setIsLocating(false),
      { timeout: 8000 }
    );
  };

  const isVaccineRelevant = (ageStr: string) => {
    if (!ageInfo) return false;
    const index = strings.vaccineScheduleData.findIndex(v => v.age === ageStr);
    switch(index) {
      case 0: return ageInfo.years === 0 && ageInfo.months < 1;
      case 1: return ageInfo.years === 0 && ageInfo.weeks >= 4 && ageInfo.weeks < 8;
      case 2: return ageInfo.weeks < 1;
      case 3: return ageInfo.weeks >= 6 && ageInfo.weeks < 10;
      case 4: return ageInfo.weeks >= 10 && ageInfo.weeks < 14;
      case 5: return ageInfo.weeks >= 14 && ageInfo.months < 9;
      case 6: return ageInfo.months >= 9 && ageInfo.months < 16;
      case 7: return ageInfo.months >= 16 && ageInfo.years < 5;
      case 8: return ageInfo.years >= 5 && ageInfo.years < 10;
      case 9: return ageInfo.years >= 10 && ageInfo.years < 16;
      case 10: return ageInfo.years >= 16 && ageInfo.years < 20;
      default: return false;
    }
  };

  const renderMessage = (msg: Message) => (
    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%] md:max-w-[70%] space-y-1 animate-in fade-in duration-300">
        <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${
          msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-none shadow-md' : 
          msg.isError ? 'bg-rose-50 text-rose-800 border border-rose-200 rounded-tl-none' : 
          'bg-white text-gray-800 rounded-tl-none border border-slate-200'
        }`}>
          {msg.isError && <AlertCircle className="w-4 h-4 text-rose-500 mb-2 inline mr-2" />}
          {msg.image && <img src={msg.image} className="w-full h-32 object-cover rounded-lg mb-3 border border-white/20" alt="Symptom" />}
          <div className="whitespace-pre-wrap">{msg.content}</div>
          {msg.groundingLinks && msg.groundingLinks.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              {msg.groundingLinks.map((link, i) => (
                <a key={i} href={link.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-emerald-600 font-bold hover:underline">
                  <MapPin className="w-3.5 h-3.5" /> {link.title}
                </a>
              ))}
            </div>
          )}
          {msg.isError && msg.retryPrompt && (
            <button 
              onClick={() => handleSendMessage(msg.retryPrompt!, true)} 
              className="mt-4 flex items-center gap-2 bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-rose-600 transition-all active:scale-95 shadow-md"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          )}
          <div className="text-[10px] mt-2 opacity-60">
            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  );

  const renderHistoryModal = () => {
    const histLangs = Object.keys(allHistory).filter(l => allHistory[l].length > 0) as Language[];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-amber-500 p-6 text-white flex justify-between items-center">
            <div className="flex items-center gap-3"><History className="w-6 h-6" /><h2 className="font-bold text-lg">{strings.historyTitle}</h2></div>
            <button onClick={() => setShowHistoryModal(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors"><X className="w-6 h-6" /></button>
          </div>
          <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
            {histLangs.length === 0 ? <div className="text-center py-8 text-slate-400 font-medium">{strings.noHistory}</div> : 
              histLangs.map((langCode) => {
                const langData = LANGUAGES.find(l => l.code === langCode);
                return (
                  <button key={langCode} onClick={() => { setViewingHistoryLang(langCode); setShowHistoryModal(false); }} className="w-full flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-amber-300 hover:bg-amber-50 transition-all text-left">
                    <div><div className="font-bold text-slate-800">{langData?.nativeName}</div><div className="text-xs text-gray-400">{langData?.name}</div></div>
                    <div className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full">{allHistory[langCode].length} msg</div>
                  </button>
                );
              })
            }
          </div>
        </div>
      </div>
    );
  };

  const renderChatView = () => (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-slate-50">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {viewingHistoryLang ? (
          <div className="space-y-4">
            <button onClick={() => setViewingHistoryLang(null)} className="flex items-center gap-2 text-slate-600 font-bold bg-white border border-slate-200 px-4 py-2 rounded-full mb-4 shadow-sm"><ChevronLeft className="w-4 h-4" /> {strings.backToCurrent}</button>
            {(allHistory[viewingHistoryLang] || []).map(renderMessage)}
          </div>
        ) : (
          <>
            {messages.map(renderMessage)}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce delay-100" />
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {!viewingHistoryLang && (
        <div className="p-4 bg-white border-t border-slate-200">
          {isTranslatingInput && (
            <div className="flex items-center gap-2 mb-2 text-emerald-600 animate-pulse">
              <Sparkles className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Translating to {strings.tabs.find(t=>t.id==='chat')?.label} Script...</span>
            </div>
          )}
          <div className="flex overflow-x-auto gap-2 no-scrollbar pb-3">
            {strings.quickQuestions.map((q, idx) => (
              <button key={idx} onClick={() => handleSendMessage(q)} className="whitespace-nowrap bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-xs font-bold hover:bg-emerald-100 transition-all flex-shrink-0">{q}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-slate-200"><ImageIcon className="w-5 h-5" /></button>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={inputValue} 
                onChange={(e) => setInputValue(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputValue)} 
                placeholder={strings.typeMessage} 
                className={`w-full bg-slate-100 rounded-2xl pl-10 pr-12 py-3 text-sm focus:ring-2 focus:ring-emerald-500 border-none outline-none transition-all ${isTranslatingInput ? 'bg-emerald-50' : ''}`} 
              />
              <button 
                onClick={handleManualTranslate} 
                className={`absolute left-2 top-1.5 p-1.5 rounded-xl transition-all ${inputValue.length >= 2 ? 'text-emerald-600 bg-emerald-100' : 'text-slate-300'}`} 
                disabled={inputValue.length < 2 || isTranslatingInput}
              >
                <Languages className="w-5 h-5" />
              </button>
              <button onClick={toggleRecording} className={`absolute right-2 top-1.5 p-1.5 rounded-xl transition-all ${isRecording ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-400'}`}><Mic className="w-5 h-5" /></button>
            </div>
            <button onClick={() => handleSendMessage(inputValue)} disabled={(!inputValue.trim() && !selectedImage) || isTyping} className="bg-emerald-600 text-white p-3 rounded-2xl shadow-lg active:scale-95 disabled:opacity-50 transition-all"><Send className="w-5 h-5" /></button>
          </div>
        </div>
      )}
    </div>
  );

  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full animate-in zoom-in duration-300">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6"><Heart className="text-emerald-600 w-10 h-10 fill-current animate-pulse" /></div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">JeevanSathi</h1>
          <p className="text-gray-600 mb-8">{language === 'en' ? 'Your Health, Our Priority.' : 'आपका स्वास्थ्य, हमारी प्राथमिकता।'}</p>
          <div className="grid grid-cols-1 gap-3">
            {LANGUAGES.map((lang) => (
              <button key={lang.code} onClick={() => handleStart(lang.code)} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${language === lang.code ? 'border-emerald-500 bg-emerald-50' : 'border-emerald-50 hover:border-emerald-200'}`}>
                <div><span className="font-bold text-gray-800 block">{lang.nativeName}</span><span className="text-xs text-gray-400">{lang.name}</span></div>
                <ChevronRight className={language === lang.code ? 'text-emerald-600' : 'text-emerald-300'} />
              </button>
            ))}
          </div>
          {Object.keys(allHistory).length > 0 && (
            <button onClick={() => setShowHistoryModal(true)} className="mt-6 flex items-center justify-center gap-2 w-full py-3 text-emerald-600 font-bold hover:bg-emerald-50 rounded-xl transition-all"><History className="w-4 h-4" /> {strings.viewPastHistory}</button>
          )}
        </div>
        {showHistoryModal && renderHistoryModal()}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {showHistoryModal && renderHistoryModal()}
      <header className="bg-white border-b border-slate-100 p-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowSidebar(true)} className="p-1 lg:hidden text-gray-600"><Menu /></button>
          <div className="bg-emerald-100 p-2 rounded-full"><Heart className="text-emerald-600 w-5 h-5 fill-current" /></div>
          <div><h1 className="font-bold text-emerald-800 text-lg leading-tight">JeevanSathi</h1><span className="text-[10px] uppercase font-bold text-emerald-500/70 tracking-widest">{LANGUAGES.find(l => l.code === language)?.name} AI</span></div>
        </div>
        <div className="flex gap-2">
           <button onClick={() => setShowHistoryModal(true)} className={`p-2 rounded-xl transition-colors ${Object.keys(allHistory).length > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`} disabled={Object.keys(allHistory).length === 0}><History className="w-4 h-4" /></button>
           <button onClick={() => setHasStarted(false)} className="p-2 bg-slate-100 rounded-xl hover:bg-emerald-50" title={strings.chooseLanguage}><Languages className="w-4 h-4 text-slate-600" /></button>
           <a href="tel:108" className="bg-rose-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold shadow-lg shadow-rose-200 active:scale-95 transition-all"><PhoneCall className="w-3.5 h-3.5" /> 108</a>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <aside className={`fixed inset-y-0 left-0 z-30 w-72 bg-white border-r transform transition-transform duration-300 lg:relative lg:translate-x-0 ${showSidebar ? 'translate-x-0' : '-translate-x-full'}`}>
           <div className="p-6 h-full flex flex-col">
              <div className="flex justify-between items-center mb-8"><span className="font-bold text-lg text-emerald-800 uppercase tracking-widest text-xs">{strings.menu}</span><button onClick={() => setShowSidebar(false)} className="lg:hidden p-1"><X className="w-5 h-5" /></button></div>
              <nav className="space-y-2 flex-1">
                {strings.tabs.map((tab: any) => (
                  <button key={tab.id} onClick={() => { setCurrentView(tab.id as View); setShowSidebar(false); }} className={`flex items-center gap-3 w-full p-4 rounded-2xl font-bold text-sm transition-all ${currentView === tab.id ? 'bg-emerald-600 text-white shadow-xl' : 'text-slate-600 hover:bg-slate-50'}`}>{tab.icon} {tab.label}</button>
                ))}
              </nav>
              <div className="mt-4 border-t pt-4 space-y-4">
                <button onClick={clearChat} className="flex items-center gap-3 w-full p-4 rounded-2xl font-bold text-sm text-rose-600 hover:bg-rose-50 transition-all"><Trash2 className="w-5 h-5" /> Clear Chat</button>
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${location ? 'bg-emerald-500' : 'bg-slate-300 animate-pulse'}`} /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{location ? strings.locationReady : strings.locationNotSet}</span>
                  {!location && <button onClick={requestLocation} className="ml-auto text-[10px] text-emerald-600 font-bold hover:underline">Enable</button>}
                </div>
              </div>
           </div>
        </aside>
        {showSidebar && <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setShowSidebar(false)} />}
        <div className="flex-1 flex flex-col min-w-0">
          {currentView === 'chat' ? renderChatView() : (
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
              {currentView === 'vaccines' && (
                <div className="space-y-6 max-w-2xl mx-auto">
                  <div className="bg-blue-600 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden"><Syringe className="absolute -right-4 -bottom-4 w-32 h-32 opacity-20 rotate-12" /><h2 className="text-2xl font-bold mb-2">{strings.vaxSchedule}</h2><p className="text-blue-100 text-sm">{strings.vaxScheduleSub}</p></div>
                  <div className="bg-white p-6 rounded-3xl border border-blue-100 shadow-sm space-y-4"><div className="flex items-center gap-3"><Calendar className="w-5 h-5 text-blue-600" /><h3 className="font-bold text-gray-800">{strings.checkDueVax}</h3></div><input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all" />{ageInfo && <div className="p-3 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-100">{strings.age}: {ageInfo.years > 0 ? `${ageInfo.years}y ` : ''}{ageInfo.months % 12}m {ageInfo.years === 0 ? `${ageInfo.weeks % 4}w` : ''}</div>}</div>
                  <div className="space-y-3 pb-24">
                    {strings.vaccineScheduleData.map((v, i) => (
                      <div key={i} className={`bg-white p-4 rounded-2xl border transition-all flex flex-col gap-3 ${isVaccineRelevant(v.age) ? 'border-blue-500 shadow-xl' : 'border-slate-100'}`}>
                        <div className="flex gap-4">
                          <div className={`font-bold text-[10px] px-3 py-1 rounded-full h-fit whitespace-nowrap ${isVaccineRelevant(v.age) ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>{v.age}</div>
                          <div className="flex-1"><h4 className="font-bold text-gray-800 text-sm">{v.vaccines}</h4><p className="text-xs text-gray-500 leading-relaxed mt-1">{v.info}</p></div>
                          {isVaccineRelevant(v.age) && <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />}
                        </div>
                        <button 
                          onClick={() => handleSendMessage(`${strings.vaxDetailPrompt} ${v.vaccines} (${v.age})`)} 
                          className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-blue-600 border-t border-slate-50 hover:bg-blue-50 rounded-b-xl transition-all"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> {strings.askAI}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {currentView === 'alerts' && (
                <div className="space-y-6 max-w-2xl mx-auto">
                  <div className="bg-rose-600 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden"><Bell className="absolute -right-4 -bottom-4 w-32 h-32 opacity-20" /><h2 className="text-2xl font-bold mb-2">{strings.regionalAlerts}</h2><p className="text-rose-100 text-sm">{strings.regionalAlertsSub}</p></div>
                  {strings.alertsData.map(alert => (
                    <div key={alert.id} className="bg-white rounded-3xl border border-rose-100 relative overflow-hidden shadow-sm flex flex-col">
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${alert.severity === 'high' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                      <div className="p-6"><div className="flex items-center gap-3 mb-3"><div className="p-2 bg-rose-50 rounded-xl text-rose-600">{alert.icon}</div><h3 className="font-bold text-gray-800 text-lg">{alert.title}</h3></div><p className="text-sm text-gray-600 mb-4">{alert.desc}</p><div className="bg-slate-50 p-4 rounded-2xl space-y-2"><h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><AlertTriangle className="w-3 h-3" /> {strings.precautions}</h4>{alert.precautions.map((p, i) => <li key={i} className="text-xs text-gray-700 list-none flex items-start gap-2"><span className="text-emerald-500 font-bold">•</span> {p}</li>)}</div></div>
                      <button onClick={() => handleSendMessage(`${strings.alertDetailPrompt} ${alert.title}`)} className="flex items-center justify-center gap-2 py-4 bg-rose-50 text-rose-600 font-bold text-sm hover:bg-rose-100 transition-all border-t border-rose-100"><Sparkles className="w-4 h-4" /> {strings.askAI}</button>
                    </div>
                  ))}
                </div>
              )}
              {currentView === 'help' && (
                <div className="space-y-6 max-w-2xl mx-auto">
                   <div className="bg-emerald-600 text-white p-8 rounded-3xl flex items-center gap-4 shadow-xl relative overflow-hidden"><FileText className="w-12 h-12 flex-shrink-0" /><div><h2 className="text-2xl font-bold">{strings.reportAnalysis}</h2><p className="text-emerald-100 text-sm">{strings.reportAnalysisSub}</p></div></div>
                   <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                     <h3 className="font-bold text-gray-800 mb-4 uppercase tracking-widest text-xs">{strings.emergencySupport}</h3>
                     <a href="tel:108" className="flex items-center justify-between p-5 bg-rose-50 text-rose-800 rounded-2xl font-bold mb-3 hover:bg-rose-100 transition-all">Ambulance Service (108) <PhoneCall className="w-5 h-5" /></a>
                     <a href="tel:104" className="flex items-center justify-between p-5 bg-emerald-50 text-emerald-800 rounded-2xl font-bold hover:bg-emerald-100 transition-all">Health Helpline (104) <PhoneCall className="w-5 h-5" /></a>
                   </div>
                   <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm"><h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Info className="w-4 h-4 text-emerald-600" /> {strings.howToUse}</h3><p className="text-sm text-gray-500 leading-relaxed">{strings.howToUseSub}</p></div>
                </div>
              )}
            </div>
          )}
          <nav className="lg:hidden grid grid-cols-4 bg-white border-t border-slate-100 pb-safe z-20">
            {strings.tabs.map((tab: any) => (
              <button key={tab.id} onClick={() => setCurrentView(tab.id as View)} className={`flex flex-col items-center justify-center p-3 gap-1 transition-all ${currentView === tab.id ? 'text-emerald-600 bg-emerald-50/50' : 'text-slate-400'}`}>{tab.icon}<span className="text-[10px] font-bold uppercase tracking-tighter">{tab.label}</span></button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
};

export default App;
