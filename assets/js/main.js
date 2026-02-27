/* ─── Supabase config ─── */
const SUPABASE_URL = "https://qailhhojedrbvxutugrl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gslgz9vZ-X8cCEB4dr9s6g_D7JG8Ht8";

document.addEventListener("DOMContentLoaded", () => {
  /* ─── Existing: Award checkbox toggle ─── */
  const awardCheckbox = document.querySelector("#award-entry");
  const awardHandleWrap = document.querySelector("#award-handle-wrap");
  const awardHandle = document.querySelector("#award-handle");

  if (awardCheckbox && awardHandleWrap && awardHandle) {
    const syncAwardField = () => {
      const active = awardCheckbox.checked;
      awardHandleWrap.hidden = !active;
      awardHandle.disabled = !active;
      awardHandle.required = active;
      if (!active) awardHandle.value = "";
    };

    awardCheckbox.addEventListener("change", syncAwardField);
    syncAwardField();
  }

  /* ─── Existing: Rental checkbox toggle ─── */
  const rentalCheckbox = document.querySelector("#rental");
  const rentalDetailWrap = document.querySelector("#rental-detail-wrap");
  const rentalHeight = document.querySelector("#rental-height");
  const rentalWeight = document.querySelector("#rental-weight");

  if (rentalCheckbox && rentalDetailWrap && rentalHeight && rentalWeight) {
    const syncRentalFields = () => {
      const active = rentalCheckbox.checked;
      rentalDetailWrap.hidden = !active;
      rentalHeight.disabled = !active;
      rentalWeight.disabled = !active;
      rentalHeight.required = active;
      rentalWeight.required = active;
      if (!active) {
        rentalHeight.value = "";
        rentalWeight.value = "";
      }
    };

    rentalCheckbox.addEventListener("change", syncRentalFields);
    syncRentalFields();
  }

  /* ─── Existing: FAQ accordion ─── */
  const faqItems = document.querySelectorAll(".faq details");
  faqItems.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      faqItems.forEach((other) => {
        if (other !== item) other.open = false;
      });
    });
  });

  /* ─── Existing: Scroll-reveal ─── */
  const revealItems = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((el) => el.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.01 }
    );
    revealItems.forEach((el) => observer.observe(el));
  }

  /* ─── Supabase: Init ─── */
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* ─── Slot UI helpers ─── */
  function updateSlotUI(slotId, remaining) {
    const remainingEl = document.querySelector(`.slot-remaining[data-slot="${slotId}"]`);
    const ctaEl = document.querySelector(`.slot-cta[data-slot="${slotId}"]`);
    if (!remainingEl || !ctaEl) return;

    if (remaining <= 0) {
      remainingEl.textContent = "満枠";
      remainingEl.classList.add("sold-out");
      ctaEl.textContent = "満枠";
      ctaEl.classList.add("disabled");
      ctaEl.removeAttribute("href");
    } else {
      remainingEl.textContent = `残り ${remaining} 枠`;
      remainingEl.classList.remove("sold-out");
      ctaEl.textContent = "この回に申し込む";
      ctaEl.classList.remove("disabled");
      ctaEl.setAttribute("href", "#form");
    }

    // Also disable the corresponding radio button if sold out
    const radio = document.querySelector(`#${slotId}`);
    if (radio) {
      radio.disabled = remaining <= 0;
    }
  }

  /* ─── Fetch initial slot data ─── */
  async function fetchSlots() {
    const { data, error } = await supabase.from("slots").select("*");
    if (error) {
      console.error("Failed to fetch slots:", error);
      return;
    }
    data.forEach((slot) => {
      updateSlotUI(slot.id, slot.capacity - slot.reserved);
    });
  }

  fetchSlots();

  /* ─── Realtime subscription ─── */
  supabase
    .channel("slots-realtime")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "slots" }, (payload) => {
      const slot = payload.new;
      updateSlotUI(slot.id, slot.capacity - slot.reserved);
    })
    .subscribe();

  /* ─── Slot-card CTA click → scroll to form + select radio ─── */
  document.querySelectorAll(".slot-cta").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (btn.classList.contains("disabled")) {
        e.preventDefault();
        return;
      }
      const slotId = btn.dataset.slot;
      const radio = document.querySelector(`#${slotId}`);
      if (radio && !radio.disabled) {
        radio.checked = true;
      }
    });
  });

  /* ─── Form submission → Supabase RPC ─── */
  const form = document.querySelector(".entry-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "送信中…";

      const fd = new FormData(form);
      const session = fd.get("session");

      if (!session) {
        alert("参加希望回を選択してください。");
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
      }

      const params = {
        p_name: fd.get("name"),
        p_email: fd.get("email"),
        p_session: session,
        p_rental: !!fd.get("rental"),
        p_rental_height: fd.get("rental_height") ? parseInt(fd.get("rental_height"), 10) : null,
        p_rental_weight: fd.get("rental_weight") ? parseInt(fd.get("rental_weight"), 10) : null,
        p_award_entry: !!fd.get("award_entry"),
        p_award_handle: fd.get("award_handle") || null,
      };

      const { data, error } = await supabase.rpc("submit_entry", params);

      if (error) {
        console.error("RPC error:", error);
        alert("送信に失敗しました。時間をおいて再度お試しください。");
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
      }

      if (data && data.error) {
        alert(data.error);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
      }

      // Show success UI, hide form
      form.hidden = true;
      const successEl = document.querySelector("#form-success");
      if (successEl) successEl.hidden = false;
    });
  }
});
