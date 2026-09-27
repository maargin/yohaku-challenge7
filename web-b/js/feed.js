/* ============================================================
   Handshake feed (F5).

   Chat-style log of the machine messages satellites send each
   other: PROPOSE / ACK / DO-NOT-MOVE / EXECUTED / ESCALATE.

   Rebuilds from the episode data rather than accumulating blindly,
   so jumping around the timeline never duplicates or loses messages.
   ============================================================ */

import { formatTMin } from './player.js';

const KNOWN_TYPES = new Set(['PROPOSE', 'ACK', 'DO-NOT-MOVE', 'EXECUTED', 'ESCALATE']);
const STICK_PX = 48;   // if the reader is this close to the bottom, keep following new messages

export class HandshakeFeed {
  constructor(panel, onNewMessages) {
    this.panel = panel;
    this.onNewMessages = onNewMessages || null;
    this.episode = null;
    this.shownThrough = -1;   // last step index already rendered

    this.list = document.createElement('ol');
    this.list.className = 'feed';
    this.list.setAttribute('aria-live', 'polite');
    this.list.setAttribute('aria-label', 'Intent handshake messages');

    this.empty = document.createElement('p');
    this.empty.className = 'faint';
    this.empty.style.cssText = 'font-size: 12.5px; margin: 0';
    this.empty.textContent = 'No messages yet. Press play to start the encounter.';

    const foot = document.createElement('p');
    foot.className = 'faint';
    foot.style.cssText = 'font-size: 11.5px; line-height: 1.55; margin: var(--sp-4) 0 0';
    foot.textContent = 'In 2019 this exchange was an email thread. When one message went unseen, ' +
      'the two sides stopped sharing a picture of the encounter.';

    const head = document.createElement('span');
    head.className = 'eyebrow';
    head.textContent = 'Intent handshake';
    head.style.cssText = 'display: block; margin-bottom: var(--sp-3)';

    this.panel.replaceChildren(head, this.empty, this.list, foot);
  }

  load(episode) {
    this.episode = episode;
    this.shownThrough = -1;
    this.list.replaceChildren();
    this._syncEmpty();
  }

  /* Call on every player 'step'. */
  showThrough(index) {
    if (!this.episode) return;
    const steps = this.episode.steps || [];

    if (index < this.shownThrough) {
      // moved backwards: rebuild from the start
      this.list.replaceChildren();
      this.shownThrough = -1;
    }

    const follow = this._nearBottom();
    let added = 0;
    for (let i = this.shownThrough + 1; i <= index && i < steps.length; i++) {
      for (const msg of steps[i].messages || []) {
        this.list.append(this._item(msg, steps[i], i === index));
        added++;
      }
    }
    this.shownThrough = Math.max(this.shownThrough, index);
    this._syncEmpty();

    if (added && follow) this.panel.scrollTop = this.panel.scrollHeight;
    if (added && this.onNewMessages) this.onNewMessages(added);
  }

  _item(msg, step, isNew) {
    const type = KNOWN_TYPES.has(msg.type) ? msg.type : 'OTHER';

    const li = document.createElement('li');
    li.className = 'feed__item' + (type === 'ESCALATE' ? ' feed__item--warn' : '') + (isNew ? ' is-new' : '');

    const top = document.createElement('div');
    top.className = 'feed__top';
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.type = type;
    chip.textContent = msg.type || 'MESSAGE';
    const time = document.createElement('time');
    time.className = 'mono faint';
    time.textContent = formatTMin(step.t_min);
    top.append(chip, time);

    const route = document.createElement('span');
    route.className = 'mono dim feed__route';
    route.textContent = `${msg.from ?? '?'} \u2192 ${msg.to ?? '?'}`;

    const text = document.createElement('p');
    text.className = 'feed__text';
    text.textContent = msg.text || '';

    li.append(top, route, text);
    return li;
  }

  _nearBottom() {
    const p = this.panel;
    return p.scrollHeight - p.scrollTop - p.clientHeight < STICK_PX;
  }

  _syncEmpty() {
    this.empty.hidden = this.list.childElementCount > 0;
  }
}
