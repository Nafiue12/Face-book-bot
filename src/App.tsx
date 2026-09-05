import React, { useState, useEffect } from 'react';
import { Dumbbell, Instagram, Facebook, Copy, Loader2, RefreshCw, CheckCircle2, Settings, X, Save, Send, Plus, Trash2 } from 'lucide-react';

interface PostData {
  fact: string;
  caption: string;
  hashtags: string;
  comment_source: string;
  image_url: string;
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [postData, setPostData] = useState<PostData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedSource, setCopiedSource] = useState(false);
  
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settings, setSettings] = useState({
    isActive: false,
    scheduleTimes: ['09:00'],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    fbPageId: '',
    igUserId: '',
    accessToken: '',
    webhookSecret: ''
  });

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data === 'object') {
          if (data.scheduleTime && !data.scheduleTimes) {
            data.scheduleTimes = [data.scheduleTime];
          }
          if (!data.scheduleTimes) {
            data.scheduleTimes = ['09:00'];
          }
          if (!data.timezone) {
            data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          }
          setSettings(prev => ({ ...prev, ...data }));
        }
      })
      .catch(err => console.error('Failed to load settings:', err));
  }, []);

  const addTime = () => {
    setSettings(prev => ({ ...prev, scheduleTimes: [...prev.scheduleTimes, '12:00'] }));
  };

  const updateTime = (index: number, newTime: string) => {
    const newTimes = [...settings.scheduleTimes];
    newTimes[index] = newTime;
    setSettings({ ...settings, scheduleTimes: newTimes });
  };

  const removeTime = (index: number) => {
    const newTimes = settings.scheduleTimes.filter((_, i) => i !== index);
    setSettings({ ...settings, scheduleTimes: newTimes });
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsLoading(true);
    setSettingsSaved(false);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSettingsLoading(false);
    }
  };

  const generatePost = async () => {
    setLoading(true);
    setError(null);
    setPostData(null);
    setCopiedCaption(false);
    setCopiedSource(false);
    setPublishSuccess(false);

    try {
      const response = await fetch('/api/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to generate post');
      }

      const data: PostData = await response.json();
      setPostData(data);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: 'caption' | 'source') => {
    navigator.clipboard.writeText(text);
    if (type === 'caption') {
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    } else {
      setCopiedSource(true);
      setTimeout(() => setCopiedSource(false), 2000);
    }
  };

  const publishNow = async () => {
    setPublishing(true);
    setError(null);
    setPublishSuccess(false);

    try {
      const response = await fetch('/api/publish-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to publish post');
      }

      const data = await response.json();
      setPostData(data.postData);
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 5000);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during publishing.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-orange-200">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center shadow-sm">
            <Dumbbell className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-stone-900">FitPost Generator</h1>
            <p className="text-sm text-stone-500 font-medium">
              Daily Gym Fact Bot
              {settings.isActive && <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Auto-Posting Active
              </span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {publishSuccess && (
            <span className="text-sm font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 hidden md:inline-flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Successfully published!
            </span>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2.5 rounded-lg font-semibold transition-colors shadow-sm"
          >
            <Settings className="w-5 h-5" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          <button
            onClick={generatePost}
            disabled={loading || publishing}
            className="flex items-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2.5 rounded-lg font-semibold transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            <span className="hidden sm:inline">Generate (Draft)</span>
          </button>
          <button
            onClick={publishNow}
            disabled={loading || publishing}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-semibold transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {publishing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            <span className="hidden sm:inline">{publishing ? 'Publishing...' : 'Publish Now'}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        {!postData && !loading && !error && (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-20 h-20 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
              <Dumbbell className="w-10 h-10 text-orange-600" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Ready to inspire your audience?</h2>
            <p className="text-stone-500 mb-8 leading-relaxed">
              Generate a high-quality, science-backed gym fact complete with a motivational caption, viral hashtags, and a stunning AI image. Or enable auto-posting in settings.
            </p>
            <button
              onClick={generatePost}
              className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-3 rounded-xl font-medium transition-colors shadow-md"
            >
              Generate First Post
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl max-w-2xl mx-auto flex flex-col items-center text-center">
            <p className="font-semibold mb-2">Oops! Something went wrong.</p>
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={generatePost}
              className="mt-4 bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {loading || publishing ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center max-w-md mx-auto animate-pulse">
            <div className="w-16 h-16 bg-stone-200 rounded-2xl mb-6 flex items-center justify-center">
               <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
            </div>
            <h2 className="text-xl font-semibold text-stone-700 mb-2">
              {publishing ? 'Generating & Publishing...' : 'Crafting your post...'}
            </h2>
            <p className="text-stone-500 text-sm">
              {publishing ? 'Consulting AI fitness experts and dispatching to social media.' : 'Consulting AI fitness experts and rendering visuals.'}
            </p>
          </div>
        ) : null}

        {postData && !loading && !publishing && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Left Column: Image Preview */}
            <div className="flex flex-col gap-4">
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-stone-200">
                <div className="aspect-square bg-stone-100 rounded-xl overflow-hidden relative group">
                  <img
                    src={postData.image_url}
                    alt="Motivational Fitness"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                     <p className="text-white text-sm font-medium px-4 text-center">Library Image</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="flex-1 bg-[#1877F2]/10 text-[#1877F2] p-4 rounded-xl flex items-center justify-center gap-2 font-semibold">
                  <Facebook className="w-5 h-5" />
                  Facebook Ready
                </div>
                <div className="flex-1 bg-gradient-to-tr from-[#FD1D1D]/10 to-[#C13584]/10 text-[#C13584] p-4 rounded-xl flex items-center justify-center gap-2 font-semibold">
                  <Instagram className="w-5 h-5" />
                  Instagram Ready
                </div>
              </div>
            </div>

            {/* Right Column: Text Content */}
            <div className="flex flex-col gap-6">
              
              <div className="bg-orange-50 border border-orange-200 p-6 rounded-2xl">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-orange-600 uppercase tracking-wide">Today's Fact</h3>
                  {postData.category && (
                    <span className="bg-orange-200 text-orange-800 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                      {postData.category}
                    </span>
                  )}
                </div>
                <p className="text-lg font-medium text-stone-900">{postData.fact}</p>
              </div>

              <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                <div className="bg-stone-50 border-b border-stone-200 px-5 py-3 flex justify-between items-center">
                  <h3 className="font-semibold text-stone-800">Caption & Hashtags</h3>
                  <button
                    onClick={() => copyToClipboard(`${postData.caption}\n\n${postData.hashtags}`, 'caption')}
                    className="text-stone-500 hover:text-stone-900 transition-colors flex items-center gap-1.5 text-sm font-medium bg-white border border-stone-200 px-3 py-1.5 rounded-md shadow-sm"
                  >
                    {copiedCaption ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    {copiedCaption ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="p-5 flex-1">
                  <p className="text-stone-700 whitespace-pre-wrap leading-relaxed mb-4">
                    {postData.caption}
                  </p>
                  <p className="text-blue-600 font-medium break-words">
                    {postData.hashtags}
                  </p>
                </div>
              </div>

              <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-stone-50 border-b border-stone-200 px-5 py-3 flex justify-between items-center">
                  <div>
                     <h3 className="font-semibold text-stone-800">First Comment</h3>
                     <p className="text-xs text-stone-500">Post this immediately after publishing</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`Source: ${postData.comment_source}`, 'source')}
                    className="text-stone-500 hover:text-stone-900 transition-colors flex items-center gap-1.5 text-sm font-medium bg-white border border-stone-200 px-3 py-1.5 rounded-md shadow-sm"
                  >
                    {copiedSource ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    {copiedSource ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="p-5">
                  <p className="text-stone-700 text-sm">
                    Source: <a href={postData.comment_source} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{postData.comment_source}</a>
                  </p>
                </div>
              </div>

            </div>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-stone-900">Automation Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-stone-400 hover:text-stone-600 transition-colors p-1 rounded-md hover:bg-stone-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={saveSettings} className="p-6">
              <div className="space-y-5">
                {/* Auto Post Toggle */}
                <div className="flex items-center justify-between p-4 bg-stone-50 border border-stone-200 rounded-xl">
                  <div>
                    <h3 className="font-semibold text-stone-800 text-sm">Enable Auto-Posting</h3>
                    <p className="text-xs text-stone-500 mt-0.5">Bot will post daily at the selected time.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={settings.isActive} onChange={(e) => setSettings({ ...settings, isActive: e.target.checked })} />
                    <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-sm font-semibold text-stone-700">Schedule Times (Daily)</label>
                      <button type="button" onClick={addTime} className="text-xs flex items-center gap-1 text-orange-600 hover:text-orange-700 font-medium bg-orange-50 px-2 py-1 rounded">
                        <Plus className="w-3.5 h-3.5" /> Add Time
                      </button>
                    </div>
                    <div className="space-y-2">
                      {settings.scheduleTimes.map((time, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input type="time" required value={time} onChange={e => updateTime(index, e.target.value)} className="flex-1 px-4 py-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors text-sm" />
                          {settings.scheduleTimes.length > 1 && (
                            <button type="button" onClick={() => removeTime(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-stone-500 mt-2">Times are in your local timezone: <strong>{settings.timezone}</strong></p>
                  </div>
                  
                  {settings.webhookSecret && (
                    <div className="mt-2 p-4 bg-orange-50 border border-orange-100 rounded-lg">
                      <h4 className="text-sm font-bold text-orange-900 mb-1.5">Cloud Cron Webhook URL</h4>
                      <p className="text-xs text-orange-700 mb-3 leading-relaxed">
                        If you deploy to a free host like Render, the server goes to sleep after 15 minutes. Put this secret URL into <strong>cron-job.org</strong> and set it to run <strong>EVERY 5 MINUTES</strong>. This will act as a "ping" to keep the server awake 24/7, allowing your internal Schedule Times (above) to trigger correctly!
                      </p>
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          readOnly 
                          value={`${window.location.origin}/api/webhook/cron?secret=${settings.webhookSecret}`}
                          className="flex-1 px-3 py-2 bg-white border border-orange-200 rounded focus:outline-none text-xs text-orange-800 font-mono"
                        />
                        <button 
                          type="button"
                          onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/webhook/cron?secret=${settings.webhookSecret}`)}
                          className="p-2 bg-white border border-orange-200 text-orange-700 hover:bg-orange-100 rounded transition-colors"
                          title="Copy to clipboard"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-stone-700 mb-1.5">Facebook Page ID</label>
                    <input type="text" placeholder="e.g. 10123456789" value={settings.fbPageId} onChange={e => setSettings({ ...settings, fbPageId: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors text-sm" />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-stone-700 mb-1.5">Instagram Account ID (Connected to Page)</label>
                    <input type="text" placeholder="e.g. 17841400000000" value={settings.igUserId} onChange={e => setSettings({ ...settings, igUserId: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors text-sm" />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-stone-700 mb-1.5">Meta Graph API <span className="text-orange-600 underline">Page</span> Access Token</label>
                    <input type="password" placeholder="EAABw..." value={settings.accessToken} onChange={e => setSettings({ ...settings, accessToken: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors text-sm" />
                    <p className="text-[11px] text-stone-500 mt-1.5">
                      <strong>IMPORTANT:</strong> Do not use a User Access Token. You must select your Page from the "User or Page" dropdown in the Graph API Explorer. Requires <code>pages_manage_posts</code>, <code>pages_read_engagement</code>, <code>instagram_basic</code>, and <code>instagram_content_publish</code>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-stone-100 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setShowSettings(false)} className="px-5 py-2.5 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={settingsLoading} className="flex items-center gap-2 bg-stone-900 hover:bg-black text-white px-5 py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed text-sm shadow-sm">
                  {settingsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (settingsSaved ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Save className="w-4 h-4" />)}
                  {settingsSaved ? 'Saved!' : 'Save & Apply Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

