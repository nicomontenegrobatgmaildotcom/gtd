// Google Apps Script: Gmail -> GTD inbox, and GTD due dates -> Google Calendar.
// Paste into script.google.com, fill in the 3 values, then run setup() once.

const API = 'https://YOUR-PROJECT.supabase.co/functions/v1/gtd';
const KEY = 'YOUR-GTD-KEY';
const ADDRESS = 'you+gtd@gmail.com';
const CAL_NAME = 'GTD';

// Creates the timers and runs both jobs once.
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('captureEmails').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('syncCalendar').timeBased().everyMinutes(15).create();
  captureEmails();
  syncCalendar();
}

// Every email sent/forwarded to ADDRESS becomes an inbox item (once).
function captureEmails() {
  const done = GmailApp.getUserLabelByName('gtd-captured') || GmailApp.createLabel('gtd-captured');
  const threads = GmailApp.search('to:' + ADDRESS + ' -label:gtd-captured', 0, 20);
  for (const t of threads) {
    const title = t.getFirstMessageSubject().replace(/^((fwd?|wg|aw|re)\s*:\s*)+/i, '').trim() || '(no subject)';
    const res = UrlFetchApp.fetch(API, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-key': KEY },
      payload: JSON.stringify({ title, notes: 'https://mail.google.com/mail/u/0/#all/' + t.getId(), source: 'email' }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 200) t.addLabel(done);
    else console.log('Capture failed: ' + res.getContentText());
  }
}

// Mirrors every open item with a due date as an all-day event in a "GTD" calendar.
function syncCalendar() {
  const cal = CalendarApp.getCalendarsByName(CAL_NAME)[0] || CalendarApp.createCalendar(CAL_NAME);
  const items = JSON.parse(UrlFetchApp.fetch(API, { headers: { 'x-key': KEY } }).getContentText());
  const want = {};
  items.forEach(i => want[String(i.id)] = i);

  const tz = Session.getScriptTimeZone();
  const from = new Date(); from.setFullYear(from.getFullYear() - 1);
  const to = new Date(); to.setFullYear(to.getFullYear() + 2);

  for (const ev of cal.getEvents(from, to)) {
    const i = want[ev.getTag('gtdId')];
    const day = Utilities.formatDate(ev.getAllDayStartDate(), tz, 'yyyy-MM-dd');
    if (i && ev.getTitle() === eventTitle(i) && day === i.due) delete want[String(i.id)]; // unchanged
    else ev.deleteEvent(); // removed, done or changed
  }

  for (const i of Object.values(want)) {
    const [y, m, d] = i.due.split('-').map(Number);
    const ev = cal.createAllDayEvent(eventTitle(i), new Date(y, m - 1, d), { description: 'GTD list: ' + i.list });
    ev.setTag('gtdId', String(i.id));
  }
}

function eventTitle(i) {
  return i.title + (i.context ? ' ' + i.context : '');
}
