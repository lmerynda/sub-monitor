import {
  useEffect,
  useRef,
  useState,
  useMemo,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Download,
  LayoutGrid,
  Leaf,
  List,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import {
  addDays,
  categories,
  chargesBetween,
  colors,
  currencies,
  dateKey,
  daysBetween,
  money,
  monthlyTotal,
  nextRenewal,
  parseDate,
  sampleSubscriptions,
  upcomingRenewals,
  validateSubscription,
  type Charge,
  type Currency,
  type Subscription,
} from '../shared/subscriptions';
import {
  disableReminders,
  enableReminders,
  registerWorker,
  reminderStatus,
  syncReminders,
  testReminder,
  REMINDER_CHANGE,
} from './push';
import { browserLock } from './browser-lock';
import {
  defaultReminderPreferences,
  reminderLeadTimes,
  leadLabel,
  hourLabel,
} from '../shared/reminder-preferences';
import {
  STORAGE,
  readSaved,
  readWorkspace,
  validBackup,
  updateWorkspace,
  changeSubscription,
  type Saved,
} from './workspace';

type View = 'calendar' | 'subscriptions' | 'reminders' | 'settings';
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const labels = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  quarterly: 'Quarterly',
  weekly: 'Weekly',
};
const prettyDate = (value: string, long = false) =>
  parseDate(value).toLocaleDateString('en-US', {
    month: long ? 'long' : 'short',
    day: 'numeric',
  });
function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Brand({
  subscription,
  small = false,
}: {
  subscription: Subscription;
  small?: boolean;
}) {
  const name = subscription.name.toLowerCase();
  const brand = name.includes('spotify')
    ? 'spotify'
    : name.includes('netflix')
      ? 'netflix'
      : name.includes('notion')
        ? 'notion'
        : name.includes('icloud')
          ? 'icloud'
          : name.includes('youtube')
            ? 'youtube'
            : name.includes('adobe')
              ? 'adobe'
              : name.includes('figma')
                ? 'figma'
                : name.includes('headspace')
                  ? 'headspace'
                  : '';
  return (
    <span
      aria-hidden="true"
      className={`brand color-${subscription.color} ${brand} ${small ? 'small' : ''}`}
    >
      {brand === 'spotify' ? (
        <span className="spotify-waves">≋</span>
      ) : brand === 'icloud' ? (
        '☁'
      ) : brand === 'youtube' ? (
        '▶'
      ) : brand === 'headspace' ? (
        '●'
      ) : brand === 'adobe' ? (
        'A'
      ) : brand === 'figma' ? (
        <span className="figma-mark">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : (
        subscription.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
function Modal({
  children,
  title,
  close,
  className = '',
}: {
  children: ReactNode;
  title: string;
  close: () => void;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${className}`}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <div>
          <span className="eyebrow">A LITTLE LESS TO KEEP IN MIND</span>
          <h2 id="modal-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function SubscriptionForm({
  subscription,
  initialDate,
  currency,
  close,
  save,
  remove,
  reminderLead,
}: {
  subscription?: Subscription;
  initialDate: string;
  currency: Currency;
  close: () => void;
  save: (s: Subscription) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reminderLead: string;
}) {
  const [color, setColor] = useState<Subscription['color']>(
    subscription?.color || 'violet',
  );
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dateKind, setDateKind] = useState<
    NonNullable<Subscription['dateKind']>
  >(subscription?.dateKind ?? 'last-charge');
  const [billingDate, setBillingDate] = useState(
    subscription?.lastCharge ?? initialDate,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const price = String(form.get('price'));
    if (!/^\d+(\.\d{1,2})?$/.test(price))
      return setError('Enter a price with no more than two decimal places.');
    const s: Subscription = {
      id: subscription?.id || crypto.randomUUID(),
      name: String(form.get('name')).trim(),
      priceCents: Math.round(Number(price) * 100),
      lastCharge: String(form.get('lastCharge')),
      dateKind,
      cycle: form.get('cycle') as Subscription['cycle'],
      category: form.get('category') as Subscription['category'],
      color,
      url: String(form.get('url')).trim(),
      notes: String(form.get('notes')).trim(),
      active: form.get('active') === 'on',
    };
    if (!validateSubscription(s))
      return setError('Please check the name, price, date, and website.');
    setSaving(true);
    try {
      await save(s);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={
        deleting
          ? 'Delete this subscription?'
          : subscription
            ? 'Edit subscription'
            : 'Add a subscription'
      }
      close={close}
    >
      {deleting ? (
        <>
          <p className="modal-copy">
            {subscription!.name} will be removed from your calendar and its
            reminders will stop. This does not cancel the subscription with the
            provider.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setDeleting(false)}
            >
              Keep subscription
            </button>
            <button
              className="button danger"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await remove(subscription!.id);
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Delete subscription
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <label className="field">
            Subscription name
            <input
              name="name"
              autoFocus
              placeholder="e.g. Spotify"
              defaultValue={subscription?.name}
              required
              maxLength={80}
            />
          </label>
          <div className="form-row">
            <label className="field">
              Price ({currency})
              <input
                name="price"
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                placeholder="0.00"
                defaultValue={
                  subscription ? (subscription.priceCents / 100).toFixed(2) : ''
                }
                required
              />
            </label>
            <label className="field">
              Billing cycle
              <select
                name="cycle"
                defaultValue={subscription?.cycle || 'monthly'}
              >
                {Object.entries(labels).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            Billing date to use
            <select
              value={dateKind}
              onChange={(e) => {
                const kind = e.target.value as NonNullable<
                  Subscription['dateKind']
                >;
                setDateKind(kind);
                if (kind === 'last-charge' && billingDate > dateKey(new Date()))
                  setBillingDate(dateKey(new Date()));
              }}
            >
              <option value="last-charge">I know the last charge date</option>
              <option value="next-renewal">I know the next billing date</option>
            </select>
          </label>
          <div className="form-row">
            <label className="field">
              {dateKind === 'next-renewal'
                ? 'Next billing date'
                : 'Last charged on'}
              <input
                name="lastCharge"
                type="date"
                min="2000-01-01"
                max={
                  dateKind === 'next-renewal'
                    ? '2100-12-31'
                    : dateKey(new Date())
                }
                value={billingDate}
                onChange={(e) => setBillingDate(e.target.value)}
                required
              />
            </label>
            <label className="field">
              Category
              <select
                name="category"
                defaultValue={subscription?.category || 'Other'}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="field-hint">
            <RefreshCw size={13} />{' '}
            {dateKind === 'next-renewal'
              ? 'Renewals start on this date. No past charge is assumed.'
              : 'Future renewals are calculated from this charge date.'}
          </p>
          <label className="field">
            Website <span className="optional">optional</span>
            <input
              name="url"
              type="url"
              placeholder="https://…"
              defaultValue={subscription?.url}
              maxLength={500}
            />
          </label>
          <label className="field">
            Notes <span className="optional">optional</span>
            <textarea
              name="notes"
              placeholder="Anything you’d like to remember"
              defaultValue={subscription?.notes}
              maxLength={1000}
              rows={2}
            />
          </label>
          <div className="form-row color-row">
            <fieldset>
              <legend>Calendar color</legend>
              <div className="color-options">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-swatch color-${c}`}
                    aria-label={`${c} calendar color`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                  >
                    {color === c && <Check size={16} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="active"
                defaultChecked={subscription?.active ?? true}
              />{' '}
              Active subscription
            </label>
          </div>
          <div className="reminder-note">
            <Bell size={17} />
            <span>
              A heads-up <strong>{reminderLead}</strong> every renewal when push
              reminders are enabled.
            </span>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-footer">
            {subscription && (
              <button
                type="button"
                className="delete-button"
                onClick={() => setDeleting(true)}
                aria-label="Delete subscription"
              >
                <Trash2 size={17} />
              </button>
            )}
            <button type="button" className="button secondary" onClick={close}>
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={saving}>
              {subscription ? 'Save changes' : 'Add subscription'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function App() {
  const initial = useMemo(readSaved, []);
  const [saved, setSaved] = useState(initial.data);
  const [storageError, setStorageError] = useState(initial.error);
  const [demo, setDemo] = useState(false);
  const [view, setView] = useState<View>(
    new URLSearchParams(location.search).get('view') === 'reminders'
      ? 'reminders'
      : 'calendar',
  );
  const [today, setToday] = useState(dateKey(new Date()));
  const [month, setMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12),
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [category, setCategory] = useState('All categories');
  const [calendarList, setCalendarList] = useState(
    () => window.matchMedia('(max-width: 740px)').matches,
  );
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Subscription | 'new' | null>(null);
  const [toast, setToast] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushError, setPushError] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [reminderRefresh, setReminderRefresh] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const subscriptions = demo
    ? sampleSubscriptions(parseDate(today))
    : saved.subscriptions;
  const currency = saved.currency;
  const reminderPrefs = saved.reminders ?? defaultReminderPreferences;
  const active = subscriptions.filter((s) => s.active);
  const upcoming = upcomingRenewals(subscriptions, today);
  const urgent = upcoming.filter(
    (c) => daysBetween(today, c.date) <= reminderPrefs.daysBefore,
  );
  const monthStart = dateKey(month);
  const monthEnd = dateKey(
    new Date(month.getFullYear(), month.getMonth() + 1, 0, 12),
  );
  const filtered = subscriptions.filter(
    (s) => category === 'All categories' || s.category === category,
  );
  const monthCharges = chargesBetween(filtered, monthStart, monthEnd);
  const gridStart = addDays(monthStart, -((month.getDay() + 6) % 7));
  const gridDays = Math.ceil((daysBetween(gridStart, monthEnd) + 1) / 7) * 7;
  const gridCharges = chargesBetween(
    filtered,
    gridStart,
    addDays(gridStart, gridDays - 1),
  );
  const yearTotal = monthlyTotal(subscriptions) * 12;
  const editingDate = selectedDay && selectedDay <= today ? selectedDay : today;

  useEffect(() => {
    const refresh = () => {
      const current = readSaved();
      setStorageError(current.error);
      if (!current.error) setSaved(current.data);
    };
    const changed = (event: StorageEvent) => {
      if (event.key === STORAGE || event.key === null) refresh();
      if (event.key === REMINDER_CHANGE || event.key === null)
        setReminderRefresh((value) => value + 1);
    };
    window.addEventListener('storage', changed);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', changed);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    void registerWorker().catch(() => {});
    const updateOnline = () => setOnline(navigator.onLine);
    const install = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const installed = () => {
      setInstallEvent(null);
      setToast('Renew is installed. Make yourself at home.');
    };
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', installed);
    const timer = setInterval(() => setToday(dateKey(new Date())), 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      window.removeEventListener('beforeinstallprompt', install);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  useEffect(() => {
    let stopped = false;
    void reminderStatus()
      .then((enabled) => {
        if (!stopped) {
          setPushEnabled(enabled);
          if (
            enabled &&
            (!('Notification' in window) ||
              Notification.permission !== 'granted')
          )
            setPushError(
              'Notification permission is blocked. Allow notifications in your browser’s site settings, or turn reminders off.',
            );
        }
      })
      .catch(() => {
        if (!stopped)
          setPushError(
            'Could not check the reminder server. Connect again to verify reminders.',
          );
      });
    return () => {
      stopped = true;
    };
  }, [online, reminderRefresh]);
  useEffect(() => {
    if (!pushEnabled) return;
    let stopped = false;
    const sync = () =>
      void syncReminders()
        .then(() => {
          if (
            !stopped &&
            'Notification' in window &&
            Notification.permission === 'granted'
          )
            setPushError('');
        })
        .catch(() => {
          if (!stopped)
            setPushError(
              'Reminder changes haven’t synced. Keep the app open and reconnect; old reminders may still be scheduled.',
            );
        });
    sync();
    const timer = setInterval(sync, 60000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pushEnabled, saved, online]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  function changeMonth(offset: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1, 12));
    setSelectedDay(null);
  }
  async function changeWorkspace(change: (latest: Saved) => Saved) {
    const next = await updateWorkspace(change);
    // Another tab may have committed again while this promise was resolving.
    setSaved(readWorkspace());
    setStorageError('');
    return next;
  }
  async function saveSubscription(subscription: Subscription) {
    await changeWorkspace((current) =>
      changeSubscription(
        current,
        subscription,
        editor && editor !== 'new' ? editor : undefined,
      ),
    );
    setDemo(false);
    setEditor(null);
    setToast('Subscription saved. One less thing to keep in mind.');
  }
  async function removeSubscription(_id: string) {
    await changeWorkspace((current) =>
      changeSubscription(current, null, editor as Subscription),
    );
    setEditor(null);
    setToast('Subscription removed.');
  }
  function edit(subscription: Subscription) {
    if (demo) {
      setToast(
        'These are examples. Start fresh to add your own subscriptions.',
      );
      return;
    }
    setEditor(subscription);
  }
  async function togglePush() {
    if (demo) {
      setToast('Start your own workspace to enable reminders.');
      return;
    }
    setPushBusy(true);
    setPushError('');
    try {
      if (pushEnabled) {
        await disableReminders();
        setPushEnabled(false);
        setToast('Push reminders turned off.');
      } else {
        await enableReminders();
        setPushEnabled(true);
        setToast(
          `Reminders enabled: ${leadLabel(reminderPrefs.daysBefore)} at ${hourLabel(reminderPrefs.hour)}. Send a test notification to check delivery.`,
        );
      }
    } catch (error) {
      setPushError(
        (error as Error).message || 'Could not change reminder settings.',
      );
    } finally {
      setPushBusy(false);
    }
  }
  async function sendTest() {
    setPushBusy(true);
    setPushError('');
    try {
      await testReminder();
      setToast(
        'Test accepted by the push service. Check your device’s notifications to confirm delivery.',
      );
    } catch (error) {
      setPushError((error as Error).message);
    } finally {
      setPushBusy(false);
    }
  }
  async function install() {
    if (!installEvent) return setInstallHelp(true);
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('That file is too large.');
      const data = JSON.parse(await file.text());
      if (!validBackup(data))
        throw new Error('This is not a valid Renew backup.');
      const expected = localStorage.getItem(STORAGE);
      if (
        !window.confirm(
          `Replace this workspace with ${data.subscriptions.length} subscriptions from your backup?`,
        )
      )
        return;
      await browserLock('workspace', () => {
        if (localStorage.getItem(STORAGE) !== expected)
          throw new Error(
            'Your workspace changed in another tab. Import again to review the replacement.',
          );
        localStorage.setItem(STORAGE, JSON.stringify(data));
      });
      setSaved(readWorkspace());
      setStorageError('');
      setDemo(false);
      setToast('Backup restored. Welcome back.');
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }
  function exportBackup() {
    try {
      download(
        storageError
          ? localStorage.getItem(STORAGE) || '{}'
          : JSON.stringify(readWorkspace(), null, 2),
        `renew-backup-${today}.json`,
        'application/json',
      );
      setToast('Backup downloaded. Keep it somewhere safe.');
    } catch {
      setToast(
        'The browser could not read your backup. Keep this window open and check browser storage settings.',
      );
    }
  }
  function freshStart() {
    setDemo(false);
    setSelectedDay(null);
    setCategory('All categories');
    setToast('Your calendar is ready. Add your first subscription.');
  }
  const titles = {
    calendar: 'Your calendar',
    subscriptions: 'Your subscriptions',
    reminders: 'Your reminders',
    settings: 'Make it yours',
  };
  const subtitles = {
    calendar: 'A little clarity for your recurring world.',
    subscriptions: 'All the little things that add up.',
    reminders: 'A little heads-up. A little more peace of mind.',
    settings: 'A few small details, just the way you like them.',
  };
  function chargeRow(charge: Charge, compact = false) {
    const days = daysBetween(today, charge.date);
    return (
      <button
        key={`${charge.subscription.id}:${charge.date}`}
        className={`renewal-row ${compact ? 'compact' : ''}`}
        onClick={() => edit(charge.subscription)}
      >
        <Brand subscription={charge.subscription} />
        <span className="renewal-name">
          <strong>{charge.subscription.name}</strong>
          <span>
            {compact
              ? prettyDate(charge.date)
              : `${prettyDate(charge.date)} · ${labels[charge.subscription.cycle]}`}
          </span>
        </span>
        <span className="renewal-price">
          <strong>{money(charge.subscription.priceCents, currency)}</strong>
          <span
            className={
              days >= 0 && days <= reminderPrefs.daysBefore ? 'due-soon' : ''
            }
          >
            {days === 0
              ? 'Today'
              : days === 1
                ? 'Tomorrow'
                : days > 0
                  ? `In ${days} days`
                  : charge.recorded
                    ? 'Recorded charge'
                    : 'Projected charge'}
          </span>
        </span>
      </button>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView('calendar');
          }}
        >
          <span className="logo">
            <RefreshCw size={22} strokeWidth={2.3} />
          </span>
          renew<span className="logo-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">Y</span>
          <span>
            <strong>Your workspace</strong>
            <small>Personal calendar</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <span className="nav-heading">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {(
            [
              { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
              { id: 'subscriptions', label: 'Subscriptions', Icon: LayoutGrid },
              { id: 'reminders', label: 'Reminders', Icon: Bell },
              { id: 'settings', label: 'Settings', Icon: Settings },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-link ${view === id ? 'active' : ''}`}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => setView(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === 'reminders' && urgent.length > 0 && (
                <span className="nav-badge">{urgent.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="leaf-icon">
              <Leaf size={21} />
            </span>
            <h3>Keep what you love.</h3>
            <p>
              Let go of what you don’t.
              <br />
              We’ll help you remember.
            </p>
          </div>
          <button className="install-link" onClick={() => void install()}>
            <ArrowDownToLine size={17} />
            Install Renew <ArrowRight size={15} />
          </button>
          <div className="device-note">
            <span className={`status-dot ${online ? '' : 'offline'}`} />
            <span>
              {online
                ? 'Saved on this device'
                : 'Offline · saved on this device'}
            </span>
            <ShieldCheck size={14} />
          </div>
        </div>
      </aside>
      <main>
        <header className="page-header">
          <div>
            <div className="breadcrumb">
              WORKSPACE <span>/</span> {view.toUpperCase()}
            </div>
            <h1>
              {titles[view]}
              <span className="heading-dot">.</span>
            </h1>
            <p>{subtitles[view]}</p>
          </div>
          <div className="header-actions">
            <button
              className={`icon-button notification-button ${urgent.length ? 'has-notifications' : ''}`}
              aria-label="View reminders"
              onClick={() => setView('reminders')}
            >
              <Bell size={20} />
            </button>
            <span className="header-divider" />
            <button
              className="button primary"
              onClick={() => {
                if (demo) freshStart();
                setEditor('new');
              }}
            >
              <Plus size={18} />
              Add subscription
            </button>
          </div>
        </header>
        {storageError && (
          <div className="error-banner" role="alert">
            {storageError}
          </div>
        )}
        {demo && (
          <div className="demo-banner">
            <Sparkles size={16} />
            <span>
              You’re exploring a sample calendar. These aren’t your
              subscriptions.
            </span>
            <button onClick={freshStart}>
              Start fresh <ArrowRight size={14} />
            </button>
          </div>
        )}
        {(view === 'calendar' || view === 'subscriptions') && (
          <section className="stats-grid" aria-label="Subscription summary">
            <div className="stat-card">
              <div className="stat-title">
                Estimated monthly cost
                <span className="stat-icon purple">
                  <Wallet size={18} />
                </span>
              </div>
              <div className="stat-number">
                {money(monthlyTotal(subscriptions), currency)}
                <span>/ month</span>
              </div>
              <div className="stat-caption">
                <span className="tiny-dot purple" />
                {money(yearTotal, currency)} per year, estimated
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-title">
                Active subscriptions
                <span className="stat-icon green">
                  <LayersIcon />
                </span>
              </div>
              <div className="stat-number">
                {String(active.length).padStart(2, '0')}
                <span>subscriptions</span>
              </div>
              <div className="stat-caption">
                <span className="tiny-dot green" />
                {new Set(active.map((s) => s.category)).size} categories in your
                everyday
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-title">
                Next renewal
                <span className="stat-icon orange">
                  <CalendarDays size={18} />
                </span>
              </div>
              <div className="stat-number next-renewal-number">
                {upcoming[0] ? prettyDate(upcoming[0].date) : 'All clear'}
                <span>
                  {upcoming[0]
                    ? money(upcoming[0].subscription.priceCents, currency)
                    : 'for now'}
                </span>
              </div>
              <div className="stat-caption">
                {upcoming[0] ? (
                  <>
                    <Brand subscription={upcoming[0].subscription} small />
                    {upcoming[0].subscription.name}
                    <span className="next-pill">
                      {daysBetween(today, upcoming[0].date) === 0
                        ? 'Today'
                        : `in ${daysBetween(today, upcoming[0].date)} days`}
                    </span>
                  </>
                ) : (
                  'Add a subscription to get started'
                )}
              </div>
            </div>
          </section>
        )}
        {view === 'calendar' && (
          <div className="calendar-layout">
            <section className="calendar-panel panel">
              <div className="calendar-toolbar">
                <div className="month-nav">
                  <h2>
                    {month.toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </h2>
                  <button
                    className="icon-button"
                    aria-label="Previous month"
                    onClick={() => changeMonth(-1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Next month"
                    onClick={() => changeMonth(1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                  <button
                    className="today-button"
                    onClick={() => {
                      const d = parseDate(today);
                      setMonth(new Date(d.getFullYear(), d.getMonth(), 1, 12));
                      setSelectedDay(today);
                    }}
                  >
                    Today
                  </button>
                </div>
                <div className="calendar-options">
                  <label className="category-filter">
                    <select
                      value={category}
                      aria-label="Filter by category"
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option>All categories</option>
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} />
                  </label>
                  <div className="view-toggle">
                    <button
                      className={!calendarList ? 'selected' : ''}
                      onClick={() => setCalendarList(false)}
                      aria-label="Calendar view"
                      aria-pressed={!calendarList}
                    >
                      <CalendarDays size={16} />
                    </button>
                    <button
                      className={calendarList ? 'selected' : ''}
                      onClick={() => setCalendarList(true)}
                      aria-label="List view"
                      aria-pressed={calendarList}
                    >
                      <List size={17} />
                    </button>
                  </div>
                </div>
              </div>
              {calendarList ? (
                <div className="month-list">
                  {monthCharges.length ? (
                    monthCharges.map((c) => chargeRow(c))
                  ) : (
                    <Empty
                      title={
                        subscriptions.length
                          ? 'A quiet month'
                          : 'Your calendar is ready'
                      }
                      text={
                        subscriptions.length
                          ? 'No charges here yet. A little breathing room.'
                          : 'Add your first subscription, or explore an example calendar.'
                      }
                      action={
                        subscriptions.length ? undefined : (
                          <div className="empty-actions">
                            <button
                              className="button primary"
                              onClick={() => setEditor('new')}
                            >
                              <Plus size={17} />
                              Add your first subscription
                            </button>
                            <button
                              className="text-button"
                              onClick={() => setDemo(true)}
                            >
                              Explore a sample calendar <ArrowRight size={14} />
                            </button>
                          </div>
                        )
                      }
                    />
                  )}
                </div>
              ) : (
                <>
                  <div className="weekdays">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
                      (day) => (
                        <span key={day}>{day}</span>
                      ),
                    )}
                  </div>
                  <div
                    className="calendar-grid"
                    aria-label={`${month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} charges`}
                  >
                    {Array.from({ length: gridDays }, (_, i) => {
                      const day = addDays(gridStart, i);
                      const charges = gridCharges.filter((c) => c.date === day);
                      const outside = day < monthStart || day > monthEnd;
                      return (
                        <div
                          key={day}
                          className={`calendar-day ${outside ? 'outside' : ''} ${day === today ? 'is-today' : ''} ${day === selectedDay ? 'is-selected' : ''}`}
                        >
                          <button
                            className="day-number"
                            onClick={() =>
                              setSelectedDay(day === selectedDay ? null : day)
                            }
                            aria-label={`Show charges for ${parseDate(day).toLocaleDateString('en-US', { dateStyle: 'long' })}`}
                            aria-pressed={day === selectedDay}
                          >
                            {parseDate(day).getDate()}
                          </button>
                          <div className="day-events">
                            {charges.slice(0, 2).map((c) => (
                              <button
                                key={c.subscription.id}
                                className={`calendar-event color-${c.subscription.color}`}
                                onClick={() => edit(c.subscription)}
                                title={`${c.subscription.name} · ${money(c.subscription.priceCents, currency)} · ${c.recorded ? 'Recorded charge' : 'Projected renewal'}`}
                                aria-label={`${c.subscription.name}, ${money(c.subscription.priceCents, currency)}, ${prettyDate(c.date)}, ${c.recorded ? 'recorded charge' : 'projected renewal'}`}
                              >
                                <span className="event-name">
                                  <Brand subscription={c.subscription} small />
                                  <span>{c.subscription.name}</span>
                                </span>
                                <span className="event-price">
                                  {money(c.subscription.priceCents, currency)}
                                </span>
                              </button>
                            ))}
                            {charges.length > 2 && (
                              <button
                                className="more-events"
                                onClick={() => setSelectedDay(day)}
                              >
                                +{charges.length - 2} more
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {subscriptions.length === 0 && (
                      <div className="calendar-empty">
                        <span className="empty-icon">
                          <CalendarDays size={27} />
                        </span>
                        <h3>A calendar with fewer surprises.</h3>
                        <p>
                          Add your first subscription.
                          <br />
                          We’ll take it from there.
                        </p>
                        <button
                          className="button primary"
                          onClick={() => setEditor('new')}
                        >
                          <Plus size={16} />
                          Add your first subscription
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setDemo(true)}
                        >
                          Or explore a sample calendar <ArrowRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="calendar-footer">
                <span>
                  <span className="legend-dot" />
                  {monthCharges.length}{' '}
                  {monthCharges.length === 1 ? 'charge' : 'charges'} this month{' '}
                  <span className="footer-separator">·</span> Renewals are
                  projected
                </span>
                <span>
                  Month total{' '}
                  <strong>
                    {money(
                      monthCharges.reduce(
                        (total, c) => total + c.subscription.priceCents,
                        0,
                      ),
                      currency,
                    )}
                  </strong>
                </span>
              </div>
            </section>
            <aside className="right-column">
              <section className="upcoming-panel panel">
                <div className="section-heading">
                  <h2>
                    {selectedDay
                      ? prettyDate(selectedDay, true)
                      : 'Coming up next'}
                  </h2>
                  {selectedDay ? (
                    <button
                      className="icon-button"
                      aria-label="Clear selected date"
                      onClick={() => setSelectedDay(null)}
                    >
                      <X size={16} />
                    </button>
                  ) : (
                    <span className="count-badge">{upcoming.length}</span>
                  )}
                </div>
                <p className="section-description">
                  {selectedDay
                    ? 'Charges on your selected day.'
                    : 'Your next renewals, at a glance.'}
                </p>
                <div className="upcoming-list">
                  {selectedDay ? (
                    (() => {
                      const charges = chargesBetween(
                        filtered,
                        selectedDay,
                        selectedDay,
                      );
                      return charges.length ? (
                        charges.map((c) => chargeRow(c, true))
                      ) : (
                        <Empty
                          title="Nothing scheduled"
                          text="No subscription charges on this day."
                          small
                        />
                      );
                    })()
                  ) : upcoming.length ? (
                    upcoming.slice(0, 4).map((c) => chargeRow(c, true))
                  ) : (
                    <Empty
                      title="Nothing on the horizon"
                      text="Your next renewals will appear here."
                      small
                    />
                  )}
                </div>
                <button
                  className="all-subscriptions"
                  onClick={() => setView('subscriptions')}
                >
                  View all subscriptions <ArrowRight size={15} />
                </button>
              </section>
              <section className="reminder-card">
                <span className="reminder-card-icon">
                  <Bell size={22} />
                  <span className="sparkle-one">✦</span>
                  <span className="sparkle-two">✦</span>
                </span>
                <span className="eyebrow">A LITTLE HEADS-UP</span>
                <h3>
                  Before it renews,
                  <br />
                  you’ll know.
                </h3>
                <p>
                  Get a reminder{' '}
                  <strong>{leadLabel(reminderPrefs.daysBefore)}</strong> every
                  renewal. Time to keep it, or let it go.
                </p>
                <button
                  className="reminder-enable"
                  onClick={() => void togglePush()}
                  disabled={pushBusy}
                >
                  {pushBusy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : pushEnabled ? (
                    <CheckCheck size={16} />
                  ) : (
                    <Bell size={16} />
                  )}
                  {pushEnabled ? 'Reminders enabled' : 'Enable reminders'}
                  <ArrowRight size={15} />
                </button>
                <small>
                  {pushEnabled
                    ? `${hourLabel(reminderPrefs.hour)} in your device’s time zone`
                    : 'A gentle nudge. No surprises.'}
                </small>
                {pushError && (
                  <p className="push-error" role="alert">
                    {pushError}
                  </p>
                )}
              </section>
              <div className="quiet-note">
                <ShieldCheck size={16} />
                <p>
                  Your calendar stays on this device.
                  <br />
                  Only enabled reminders go to the server.
                </p>
              </div>
            </aside>
          </div>
        )}
        {view === 'subscriptions' && (
          <section className="panel subscription-panel">
            <div className="section-toolbar">
              <div>
                <h2>
                  All subscriptions{' '}
                  <span className="count-badge">{subscriptions.length}</span>
                </h2>
                <p className="section-description">
                  A home for everything you’re subscribed to.
                </p>
              </div>
              <label className="search-field">
                <Search size={17} />
                <input
                  placeholder="Find a subscription…"
                  aria-label="Search subscriptions"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            {subscriptions.length ? (
              <div className="subscription-table">
                <div className="table-head">
                  <span>SUBSCRIPTION</span>
                  <span>BILLING</span>
                  <span>NEXT RENEWAL</span>
                  <span>STATUS</span>
                  <span />
                </div>
                {subscriptions
                  .filter((s) =>
                    `${s.name} ${s.category}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((s) => (
                    <button
                      className="subscription-table-row"
                      key={s.id}
                      onClick={() => edit(s)}
                    >
                      <span className="table-service">
                        <Brand subscription={s} />
                        <span>
                          <strong>{s.name}</strong>
                          <small>{s.category}</small>
                        </span>
                      </span>
                      <span>
                        <strong>{money(s.priceCents, currency)}</strong>
                        <small>{labels[s.cycle]}</small>
                      </span>
                      <span>
                        {nextRenewal(s, today)
                          ? prettyDate(nextRenewal(s, today)!, true)
                          : '—'}
                      </span>
                      <span>
                        <span
                          className={`status-pill ${s.active ? 'active' : ''}`}
                        >
                          {s.active ? 'Active' : 'Inactive'}
                        </span>
                      </span>
                      <MoreHorizontal size={19} />
                    </button>
                  ))}
                {subscriptions.filter((s) =>
                  `${s.name} ${s.category}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                ).length === 0 && (
                  <Empty
                    title="No matches"
                    text="Try another name or category."
                  />
                )}
              </div>
            ) : (
              <Empty
                title="Make room for what you love"
                text="Add a subscription to start seeing the bigger picture."
                action={
                  <button
                    className="button primary"
                    onClick={() => setEditor('new')}
                  >
                    <Plus size={17} />
                    Add subscription
                  </button>
                }
              />
            )}
          </section>
        )}
        {view === 'reminders' && (
          <div className="detail-layout">
            <section className="panel reminder-settings">
              <div className="section-heading">
                <h2>Never miss the moment to decide</h2>
                <Bell size={20} />
              </div>
              <p className="settings-description">
                Get a notification {leadLabel(reminderPrefs.daysBefore)} at{' '}
                {hourLabel(reminderPrefs.hour)} in your device’s time zone. The
                reminder server can send notifications while Renew is closed.
                Enable them and send a test to check delivery on this device.
              </p>
              <div className="reminder-setting-row">
                <div>
                  <strong>Push notifications</strong>
                  <p>
                    {pushEnabled
                      ? 'Enabled on this device'
                      : 'Turn on a gentle heads-up before every renewal'}
                  </p>
                </div>
                <button
                  className={`toggle ${pushEnabled ? 'enabled' : ''}`}
                  role="switch"
                  aria-label="Push notifications"
                  aria-checked={pushEnabled}
                  disabled={pushBusy || demo}
                  onClick={() => void togglePush()}
                >
                  <span />
                </button>
              </div>
              <div className="form-row reminder-preferences">
                <label className="field">
                  Remind me
                  <select
                    value={reminderPrefs.daysBefore}
                    disabled={demo}
                    onChange={(e) => {
                      const daysBefore = Number(
                        e.target.value,
                      ) as typeof reminderPrefs.daysBefore;
                      void changeWorkspace((s) => ({
                        ...s,
                        reminders: {
                          ...(s.reminders ?? defaultReminderPreferences),
                          daysBefore,
                        },
                      })).catch((error) => setToast(error.message));
                    }}
                  >
                    {reminderLeadTimes.map((days) => (
                      <option key={days} value={days}>
                        {leadLabel(days)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Send at (local time)
                  <select
                    value={reminderPrefs.hour}
                    disabled={demo}
                    onChange={(e) => {
                      const hour = Number(e.target.value);
                      void changeWorkspace((s) => ({
                        ...s,
                        reminders: {
                          ...(s.reminders ?? defaultReminderPreferences),
                          hour,
                        },
                      })).catch((error) => setToast(error.message));
                    }}
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {hourLabel(hour)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="field-hint">
                Timing is saved in your backup and applies to future unsent
                reminders. Previously sent renewals are not sent again.
              </p>
              {pushError && (
                <p className="form-error" role="alert">
                  {pushError}
                </p>
              )}
              {pushEnabled && (
                <button
                  className="button secondary"
                  disabled={pushBusy}
                  onClick={() => void sendTest()}
                >
                  <Bell size={16} />
                  Send a test notification
                </button>
              )}
              <div className="info-note">
                <CircleHelp size={18} />
                <p>
                  Notifications need permission and an internet connection. On
                  iPhone or iPad, add Renew to your Home Screen before enabling
                  them. Your device’s time zone is used when you open the app.
                </p>
              </div>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Renewing soon</h2>
                <span className="count-badge">{urgent.length}</span>
              </div>
              <p className="section-description">
                A little time to keep it, or let it go.
              </p>
              {urgent.length ? (
                urgent.map((c) => chargeRow(c))
              ) : (
                <Empty
                  title="You’re all caught up"
                  text={
                    reminderPrefs.daysBefore === 0
                      ? 'No renewals today. Enjoy the breathing room.'
                      : `No renewals in the next ${reminderPrefs.daysBefore} days. Enjoy the breathing room.`
                  }
                  small
                />
              )}
            </section>
          </div>
        )}
        {view === 'settings' && (
          <div className="settings-grid">
            <section className="panel">
              <div className="section-heading">
                <h2>Your preferences</h2>
                <Settings size={19} />
              </div>
              <label className="field settings-currency">
                Workspace currency
                <select
                  value={currency}
                  onChange={(e) => {
                    const currency = e.target.value as Currency;
                    void changeWorkspace((s) => ({ ...s, currency })).catch(
                      (error) => setToast(error.message),
                    );
                  }}
                >
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {
                        {
                          USD: 'US Dollar',
                          EUR: 'Euro',
                          GBP: 'British Pound',
                          CAD: 'Canadian Dollar',
                          AUD: 'Australian Dollar',
                        }[c]
                      }{' '}
                      ({c})
                    </option>
                  ))}
                </select>
              </label>
              <p className="field-hint">
                All prices use this currency. Changing it changes the label; it
                does not convert amounts.
              </p>
              <div className="settings-divider" />
              <div className="section-heading">
                <h2>At home on your device</h2>
                <Download size={19} />
              </div>
              <p className="settings-description">
                Install Renew for a little more room, quick access, and an
                offline calendar.
              </p>
              <button
                className="button secondary"
                onClick={() => void install()}
              >
                <ArrowDownToLine size={17} />
                Install Renew
              </button>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Your data, your choice</h2>
                <ShieldCheck size={19} />
              </div>
              <p className="settings-description">
                Subscriptions are saved in this browser. Clearing browser data
                removes them, so keep a backup. When push reminders are enabled,
                your subscription details and notification endpoint are also
                saved on the reminder server.
              </p>
              <div className="backup-actions">
                <button className="button secondary" onClick={exportBackup}>
                  <Download size={17} />
                  Export backup
                </button>
                <button
                  className="button secondary"
                  onClick={() => importRef.current?.click()}
                >
                  <Upload size={17} />
                  Import backup
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => void importBackup(e.target.files?.[0])}
                />
              </div>
              <div className="settings-divider" />
              <button
                className="text-button"
                onClick={() => {
                  setDemo(true);
                  setView('calendar');
                }}
              >
                Explore a sample calendar <ArrowRight size={15} />
              </button>
              {storageError && (
                <button
                  className="button danger"
                  onClick={async () => {
                    const expected = localStorage.getItem(STORAGE);
                    if (
                      window.confirm(
                        'Clear unreadable local data? Export the original backup first.',
                      )
                    ) {
                      try {
                        await browserLock('workspace', () => {
                          if (localStorage.getItem(STORAGE) !== expected)
                            throw new Error(
                              'Your workspace changed in another tab. Review it before clearing data.',
                            );
                          localStorage.removeItem(STORAGE);
                        });
                        location.reload();
                      } catch (error) {
                        setToast((error as Error).message);
                      }
                    }
                  }}
                >
                  Clear unreadable data
                </button>
              )}
            </section>
          </div>
        )}
        <footer className="page-footer">
          <span>
            <RefreshCw size={12} /> A little less to keep in mind.
          </span>
          <span>Made for your everyday.</span>
        </footer>
      </main>
      {editor && (
        <SubscriptionForm
          subscription={editor === 'new' ? undefined : editor}
          initialDate={editingDate}
          currency={currency}
          close={() => setEditor(null)}
          save={saveSubscription}
          remove={removeSubscription}
          reminderLead={leadLabel(reminderPrefs.daysBefore)}
        />
      )}
      {installHelp && (
        <Modal
          title="Make yourself at home"
          close={() => setInstallHelp(false)}
        >
          <p className="modal-copy">
            In Chrome or Edge, use the install icon in the address bar or choose{' '}
            <strong>Install Renew</strong> from the browser menu.
          </p>
          <p className="modal-copy">
            On iPhone or iPad, open Renew in Safari, tap <strong>Share</strong>,
            then <strong>Add to Home Screen</strong>.
          </p>
          <p className="modal-copy muted">
            Installation is available over HTTPS or localhost. For offline use,
            open the built app once while connected.
          </p>
          <div className="modal-footer">
            <button
              className="button primary"
              onClick={() => setInstallHelp(false)}
            >
              Got it
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="Dismiss message" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Empty({
  title,
  text,
  small,
  action,
}: {
  title: string;
  text: string;
  small?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={`empty-state ${small ? 'small' : ''}`}>
      <span className="empty-icon">
        <Leaf size={small ? 21 : 28} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function LayersIcon() {
  return <CreditCard size={18} />;
}
