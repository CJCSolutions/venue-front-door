'use strict';

const { addDays } = require('./time');

// Numbers for the editor's Stats tab: what each event brought in against
// what it cost, where bookings came from, and how the Circle is growing.

function buildStats({ state, schedule, bookings, members, views, enquiries }) {
  const today = schedule.today;
  const since = addDays(today, -29);

  const byKey = {};
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const k = b.event_key;
    byKey[k] = byKey[k] || { bookings: 0, guests: 0 };
    byKey[k].bookings += 1;
    byKey[k].guests += b.guests;
  }

  // Every dated event in the window (past four weeks plus the coming one).
  const rows = [...schedule.past.filter((o) => o.date >= since), ...schedule.tonight, ...schedule.upcoming.filter((o) => o.date <= addDays(today, 7))]
    .map((o) => {
      const led = (state.ledger || {})[o.key] || null;
      const cost = led ? led.talent + led.marketing + led.other : null;
      const b = byKey[o.key] || { bookings: 0, guests: 0 };
      return {
        key: o.key, name: o.name, date: o.date, past: o.date < today,
        bookings: b.bookings, guests: b.guests, capacity: o.bookable ? o.capacity : null,
        revenue: led ? led.revenue : null, cost, profit: led ? led.revenue - cost : null,
        effort: led ? led.effort : null, perMarketingEuro: led && led.marketing ? Math.round(led.revenue / led.marketing) : null
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Which recurring events earn their place: average profit per date.
  const perEvent = {};
  for (const r of rows) {
    if (r.profit === null) continue;
    const id = r.key.split('@')[0];
    perEvent[id] = perEvent[id] || { name: r.name, dates: 0, profit: 0, revenue: 0, effort: 0 };
    perEvent[id].dates += 1; perEvent[id].profit += r.profit; perEvent[id].revenue += r.revenue; perEvent[id].effort += r.effort || 0;
  }
  const ranking = Object.values(perEvent).map((e) => ({
    name: e.name, dates: e.dates, avgProfit: Math.round(e.profit / e.dates), avgRevenue: Math.round(e.revenue / e.dates),
    profitPerHour: e.effort ? Math.round(e.profit / e.effort) : null
  })).sort((a, b) => b.avgProfit - a.avgProfit);

  const sourceCount = (list, field = 'source') => {
    const out = {};
    for (const x of list) { const s = x[field] || 'direct'; out[s] = (out[s] || 0) + (x.count || x.guests || 1); }
    return Object.entries(out).sort((a, b) => b[1] - a[1]).map(([source, n]) => ({ source, n }));
  };

  const recentBookings = bookings.filter((b) => b.status !== 'cancelled' && b.created_at && b.created_at.slice(0, 10) >= since);
  const recentMembers = members.filter((m) => m.created_at && m.created_at.slice(0, 10) >= since);
  const recentViews = views.filter((v) => v.day >= since);

  const viewsByDay = {};
  for (const v of recentViews) viewsByDay[v.day] = (viewsByDay[v.day] || 0) + v.count;
  const days = [];
  for (let d = 13; d >= 0; d--) { const day = addDays(today, -d); days.push({ day, views: viewsByDay[day] || 0 }); }

  const totals = rows.filter((r) => r.past && r.revenue !== null).reduce((t, r) => ({ revenue: t.revenue + r.revenue, cost: t.cost + r.cost }), { revenue: 0, cost: 0 });

  return {
    window: { since, today },
    headline: {
      visits: recentViews.reduce((s, v) => s + v.count, 0),
      bookings: recentBookings.length,
      guests: recentBookings.reduce((s, b) => s + b.guests, 0),
      members: members.length,
      newMembers: recentMembers.length,
      openEnquiries: enquiries.filter((e) => e.status === 'new').length,
      revenue: totals.revenue,
      profit: totals.revenue - totals.cost
    },
    days,
    events: rows,
    ranking,
    visitSources: sourceCount(recentViews),
    bookingSources: sourceCount(recentBookings),
    memberSources: sourceCount(members)
  };
}

module.exports = { buildStats };
