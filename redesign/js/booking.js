// booking.js
// Handles: loading open slots, atomic booking (no double-booking),
// and firing the two EmailJS emails (client confirmation + your notification).
//
// Used by both malmok.html and capture-pose.html — see the example
// HTML files for how each page wires up its own form.
//
// REQUIRES: EmailJS browser SDK loaded on the page BEFORE this script, e.g.:
//   <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>
//   <script>emailjs.init('YOUR_EMAILJS_PUBLIC_KEY');</script>

import { supabase } from './supabase-client.js';

// ---- EDIT THESE with your real EmailJS values ----
const EMAILJS_SERVICE_ID = 'service_4ewil9m';
const EMAILJS_TEMPLATE_CLIENT = 'template_v5bsi6v';
const EMAILJS_TEMPLATE_ADMIN = 'template_lx2t0za';
const ADMIN_EMAIL = 'hello@art2digi.com';

// Payment instructions per campaign — edit the text to match your real
// payment method (bank transfer details, Tikkie/Splikto link, etc.)
const CAMPAIGN_CONFIG = {
  malmok: {
    label: 'Malmok Golden Hour Stories',
    amount: 100,
    paymentInstructions: 'AWG 100, due before your session. [ADD YOUR PAYMENT DETAILS HERE]'
  },
  capture_pose: {
    label: 'Capture & Pose',
    amount: 250,
    paymentInstructions: 'AWG 250, due to confirm your spot. [ADD YOUR PAYMENT DETAILS HERE]'
  }
};

/**
 * Populate a <select> with the currently open slots for a campaign.
 * Call this on page load and again after a failed booking attempt
 * (so a slot someone else just took disappears from the list).
 */
export async function loadOpenSlots(campaignType, selectEl) {
  selectEl.innerHTML = '<option value="">Loading available dates…</option>';
  selectEl.disabled = true;

  const { data, error } = await supabase
    .from('slots')
    .select('id, label')
    .eq('campaign_type', campaignType)
    .eq('status', 'open')
    .order('slot_date', { ascending: true })
    .order('slot_time', { ascending: true });

  selectEl.disabled = false;

  if (error) {
    console.error('loadOpenSlots error:', error);
    selectEl.innerHTML = '<option value="">Could not load dates — please refresh</option>';
    return;
  }

  if (!data || data.length === 0) {
    selectEl.innerHTML = '<option value="">No open dates right now — check back soon</option>';
    return;
  }

  selectEl.innerHTML =
    '<option value="">Select a date/time…</option>' +
    data.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
}

/**
 * For campaigns that only ever have ONE open slot at a time (e.g. Capture & Pose).
 * Returns the open slot's { id, label } or null if nothing is open right now.
 * Use this instead of loadOpenSlots() when the page shows the date as plain
 * text rather than a dropdown.
 */
export async function loadSingleOpenSlot(campaignType) {
  const { data, error } = await supabase
    .from('slots')
    .select('id, label')
    .eq('campaign_type', campaignType)
    .eq('status', 'open')
    .order('slot_date', { ascending: true })
    .order('slot_time', { ascending: true })
    .limit(1);

  if (error) {
    console.error('loadSingleOpenSlot error:', error);
    return null;
  }

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Same atomic booking + email flow as submitBooking(), but for the
 * single-slot pattern above — no dropdown to refresh on failure, just a
 * clear "this session is full" message instead.
 */
export async function submitSingleSlotBooking(fields, formEl) {
  const { campaignType, slotId, name, email, phone, notes } = fields;
  const config = CAMPAIGN_CONFIG[campaignType];
  const submitBtn = formEl.querySelector('[type="submit"]');

  if (!slotId) {
    alert('Sorry — this session is currently full or not yet open for booking.');
    return false;
  }

  submitBtn.disabled = true;
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = 'Booking…';

  try {
    const { data, error } = await supabase.rpc('book_slot', {
      p_slot_id: slotId,
      p_name: name,
      p_email: email,
      p_phone: phone || null,
      p_notes: notes || null
    });

    if (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;

      if (error.message && error.message.includes('SLOT_UNAVAILABLE')) {
        alert('Sorry — this session just filled up. Check back for the next date.');
      } else {
        console.error('book_slot error:', error);
        alert('Something went wrong saving your booking. Please try again, or email me directly.');
      }
      return false;
    }

    const booking = data;

    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_CLIENT, {
        to_email: email,
        to_name: name,
        campaign_name: config.label,
        session_label: booking.slot_label,
        amount: config.amount,
        payment_instructions: config.paymentInstructions
      });

      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ADMIN, {
        to_email: ADMIN_EMAIL,
        form_type: config.label,
        client_name: name,
        client_email: email,
        client_phone: phone || '—',
        session_label: booking.slot_label,
        details: notes || '—'
      });
    } catch (emailErr) {
      console.error('EmailJS error (booking still saved):', emailErr);
    }

    return true; // page decides what to show/redirect to on success
  } catch (err) {
    console.error('Unexpected booking error:', err);
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
    alert('Something unexpected went wrong. Please try again or email me directly.');
    return false;
  }
}
 * @param {Object} fields - { campaignType, slotId, name, email, phone, notes }
 * @param {HTMLFormElement} formEl - the form being submitted (for button state + reset)
 * @param {HTMLSelectElement} selectEl - the slot dropdown (to refresh on failure)
 * @returns {boolean} true on success
 */
export async function submitBooking(fields, formEl, selectEl) {
  const { campaignType, slotId, name, email, phone, notes } = fields;
  const config = CAMPAIGN_CONFIG[campaignType];
  const submitBtn = formEl.querySelector('[type="submit"]');

  if (!slotId) {
    alert('Please select a date/time first.');
    return false;
  }

  submitBtn.disabled = true;
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = 'Booking…';

  try {
    // 1. Atomic booking — this is the step that prevents double-booking.
    const { data, error } = await supabase.rpc('book_slot', {
      p_slot_id: slotId,
      p_name: name,
      p_email: email,
      p_phone: phone || null,
      p_notes: notes || null
    });

    if (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;

      if (error.message && error.message.includes('SLOT_UNAVAILABLE')) {
        alert('Sorry — that slot was just booked by someone else. Please pick another date.');
        await loadOpenSlots(campaignType, selectEl);
      } else {
        console.error('book_slot error:', error);
        alert('Something went wrong saving your booking. Please try again, or email me directly.');
      }
      return false;
    }

    const booking = data; // single row object returned by book_slot()

    // 2. Email the client — confirmation + payment instructions.
    // 3. Email you — notification of the new booking.
    // Run both, but don't let an email failure undo the booking (it's already saved).
    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_CLIENT, {
        to_email: email,
        to_name: name,
        campaign_name: config.label,
        session_label: booking.slot_label,
        amount: config.amount,
        payment_instructions: config.paymentInstructions
      });

      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ADMIN, {
        to_email: ADMIN_EMAIL,
        form_type: config.label,
        client_name: name,
        client_email: email,
        client_phone: phone || '—',
        session_label: booking.slot_label,
        details: notes || '—'
      });
    } catch (emailErr) {
      console.error('EmailJS error (booking still saved):', emailErr);
      // Don't alert an error here — the booking succeeded, that's what matters most.
      // Worth checking your EmailJS dashboard/logs if this keeps happening.
    }

    // 4. Show a success state in place of the form.
    formEl.innerHTML = `
      <p class="booking-success">
        Thanks, ${name}! Your ${config.label} session is booked for
        <strong>${booking.slot_label}</strong>.
        Check your email for confirmation and payment details.
      </p>`;

    return true;
  } catch (err) {
    console.error('Unexpected booking error:', err);
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
    alert('Something unexpected went wrong. Please try again or email me directly.');
    return false;
  }
}
