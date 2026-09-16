// contact.js
// Handles the general contact form: saves to Supabase, emails you a notification.
// No confirmation email to the client is sent here — add one if you want,
// using the same emailjs.send() pattern as booking.js.

import { supabase } from './supabase-client.js';

const EMAILJS_SERVICE_ID = 'service_4ewil9m';
const EMAILJS_TEMPLATE_ADMIN = 'template_lx2t0za'; // reusing the same admin-notification template as booking.js
const ADMIN_EMAIL = 'hello@art2digi.com';

export async function submitContact({ name, email, message }, formEl) {
  const submitBtn = formEl.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = 'Sending…';

  try {
    const { error } = await supabase.from('contacts').insert({ name, email, message });

    if (error) {
      console.error('contact insert error:', error);
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
      alert('Something went wrong sending your message. Please try again or email me directly.');
      return false;
    }

    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ADMIN, {
        to_email: ADMIN_EMAIL,
        form_type: 'General contact form',
        client_name: name,
        client_email: email,
        client_phone: '—',
        session_label: '—',
        details: message
      });
    } catch (emailErr) {
      console.error('EmailJS error (message still saved):', emailErr);
    }

    formEl.innerHTML = `<p class="contact-success">Thanks, ${name}! Your message is on its way — I'll get back to you soon.</p>`;
    return true;
  } catch (err) {
    console.error('Unexpected contact error:', err);
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
    alert('Something unexpected went wrong. Please try again or email me directly.');
    return false;
  }
}
