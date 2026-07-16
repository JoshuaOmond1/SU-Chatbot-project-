import "./chat-v4/index.js";

const runtimeConfig = window.SU_ASSISTANT_CONFIG ?? { mode: "preview" };

const bindLaunchers = (chat) => {
  document.querySelector("#open-chat").addEventListener("click", () => chat.open());
  document.querySelectorAll(".suggestion").forEach((button) =>
    button.addEventListener("click", async () => {
      await chat.open();
      const input = chat.shadowRoot.querySelector("textarea");
      input.value = button.dataset.question;
      input.focus();
    }),
  );
};

if (runtimeConfig.mode === "live") {
  const chat = document.querySelector("#student-assistant");
  chat.setAttribute("api-base-url", runtimeConfig.apiBaseUrl);
  chat.tokenProvider = async () => {
    const token = sessionStorage.getItem("su-assistant-access-token");
    if (!token) throw new Error("Sign in through Strathmore University to continue.");
    return token;
  };
  chat.setReady();
  bindLaunchers(chat);
} else {
  const data = await fetch("./demo-scenarios.json", { cache: "no-store" }).then((response) => response.json());
  const academicData = await fetch("./demo-academic-data.json", { cache: "no-store" }).then((response) => response.json());
  const originalFetch = window.fetch.bind(window);
  const authProfile = window.SU_AUTH?.getProfile() ?? null;
  const authSession = window.SU_AUTH?.getSession() ?? null;
  const ownerKey = authSession?.uid ?? "guest";
  const messageKey = `su-assistant:demo-messages:v3:${ownerKey}`;
  const topicKey = `su-assistant:demo-topic:v3:${ownerKey}`;
  const fallbackKey = `su-assistant:demo-fallback:v1:${ownerKey}`;
  const sessionId = "11111111-1111-4111-8111-111111111111";
  let messages = [];
  try { messages = JSON.parse(localStorage.getItem(messageKey) ?? "[]"); } catch { messages = []; }
  let activeScenarioId = localStorage.getItem(topicKey);
  let fallbackIndex = Number(localStorage.getItem(fallbackKey) ?? "0");

  const persist = () => {
    localStorage.setItem(messageKey, JSON.stringify(messages));
    if (activeScenarioId) localStorage.setItem(topicKey, activeScenarioId);
    localStorage.setItem(fallbackKey, String(fallbackIndex));
  };

  const normalise = (value) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const isContextualFollowUp = (input) => /^(and |also |then |what do i need|what next|what should i do|how do i do that|where do i go|who do i contact|which office|when is it|can i do that|tell me more)/.test(input);
  const isCapabilityQuestion = (input) => /what else can you|what can you|how can you help|what do you know|topics can you|concerning strathmore|about strathmore|tell me about strathmore|information.*strathmore/.test(input);
  const academicProfileForUser = () => {
    const programme = normalise(authProfile?.programme ?? "");
    return academicData.profiles.find((profile) =>
      profile.aliases.some((alias) => programme.includes(normalise(alias))),
    ) ?? academicData.profiles[0];
  };
  const money = (amount, currency) => new Intl.NumberFormat("en-KE", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(amount);
  const academicOwner = () => authProfile?.role === "student" ? authProfile.fullName : "Demo Student";

  const feeAnswer = () => {
    const profile = academicProfileForUser();
    const fees = profile.fees;
    return {
      content: `**${academicOwner()} — ${academicData.semester} fee statement**\n\nProgramme: **${authProfile?.role === "student" && authProfile.programme ? authProfile.programme : profile.programme}**\nTuition assigned: **${money(fees.tuition, fees.currency)}**\nOther demo charges: **${money(fees.otherCharges, fees.currency)}**\nAmount paid: **${money(fees.amountPaid, fees.currency)}**\nOutstanding balance: **${money(fees.balance, fees.currency)}**\nDemo payment date: **${fees.demoDueDate}**\n\n_${academicData.notice}_`,
      title: "Demo fee statement",
    };
  };

  const timetableAnswer = (input) => {
    const profile = academicProfileForUser();
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const today = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Africa/Nairobi" }).format(new Date()).toLowerCase();
    const requestedDay = days.find((day) => input.includes(day)) ?? (input.includes("today") ? today : undefined);
    let entries = requestedDay
      ? profile.timetable.filter((entry) => entry.day.toLowerCase() === requestedDay)
      : profile.timetable;
    const requestedUnit = profile.timetable.find((entry) =>
      input.includes(normalise(entry.code)) || input.includes(normalise(entry.title)),
    );
    if (requestedUnit) entries = [requestedUnit];
    const heading = requestedUnit
      ? `**${requestedUnit.code} — ${requestedUnit.title}**`
      : requestedDay
        ? `**${input.includes("today") ? `Today (${requestedDay[0].toUpperCase()}${requestedDay.slice(1)})` : `${requestedDay[0].toUpperCase()}${requestedDay.slice(1)}`} timetable**`
        : `**${academicOwner()} — ${academicData.semester} timetable**`;
    const rows = entries.length
      ? entries.map((entry) => `- **${entry.day}, ${entry.start}–${entry.end}** — ${entry.code} ${entry.title}, ${entry.location}`).join("\n")
      : `No demonstration classes are assigned on ${requestedDay}.`;
    return { content: `${heading}\n\n${rows}\n\n_${academicData.notice}_`, title: "Demo class timetable" };
  };

  const unitsAnswer = () => {
    const profile = academicProfileForUser();
    const rows = profile.units.filter((unit) => unit.available).map((unit) =>
      `- **${unit.code}** — ${unit.title} · ${unit.credits} credits · ${unit.type}`,
    ).join("\n");
    return {
      content: `**Units available for ${authProfile?.role === "student" && authProfile.programme ? authProfile.programme : profile.programme} — ${academicData.semester}**\n\n${rows}\n\nAvailability does not mean registration is confirmed; prerequisite and capacity checks would come from AMS in the live system.\n\n_${academicData.notice}_`,
      title: "Demo available units",
    };
  };

  const additionalUnitsAnswer = () => {
    const profile = academicProfileForUser();
    const electives = profile.units.filter((unit) => unit.available && unit.type === "Elective");
    const options = electives.length
      ? electives.map((unit) => `- **${unit.code}** — ${unit.title}`).join("\n")
      : "- No additional demonstration electives are currently listed.";
    return {
      content: `**Applying for an additional unit**\n\n1. Review your current credit load and any prerequisites.\n2. Choose an available elective or additional unit.\n3. Request the unit through the semester registration or add/drop area in AMS.\n4. Obtain academic-adviser approval if the unit increases your normal load.\n5. Confirm that the unit appears on your registered-unit list and timetable.\n\n**Available demo electives**\n${options}\n\nRegistration would only be confirmed after AMS checks prerequisites, capacity, clashes, and financial clearance.\n\n_${academicData.notice}_`,
      title: "Demo additional-unit application",
    };
  };

  const academicContactAnswer = () => {
    const profile = academicProfileForUser();
    const contact = profile.academicContact;
    return {
      content: `**${profile.programme} academic contact**\n\nOffice: **${contact.office}**\nEmail: **${contact.email}**\nPhone: **${contact.phone}**\nDemo opening hours: **${contact.hours}**\n\nFor a particular lecturer, include the unit code or unit name so the live system can identify the correct lecturer.\n\n_${academicData.notice}_`,
      title: "Demo programme-office contact",
    };
  };

  const admissionsAnswer = () => {
    const admissions = academicData.admissions;
    const steps = admissions.steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
    return {
      content: `**How to apply to join Strathmore University**\n\n${steps}\n\n**Demo admissions contact**\nOffice: ${admissions.office}\nEmail: ${admissions.email}\nPhone: ${admissions.phone}\nHours: ${admissions.hours}\n\n_This is a demonstration application journey. Confirm requirements, dates, fees, and contact information using the official Strathmore University admissions channels._`,
      title: "Demo admissions guide",
    };
  };

  const fallbackAnswer = () => {
    const variants = [
      "I do not have a reliable demonstration answer for that yet. I can still help with your **fees**, **today’s classes**, **available units**, **academic contacts**, or **admissions application**. Try asking one of those as a complete question.",
      "That question falls outside my current approved demo information, so I should not invent an answer. You could ask **“What classes do I have today?”**, **“What fees are pending?”**, or **“How do I apply to join Strathmore?”**",
      "I could not match that request to a trusted demo record. I can look up the sample **fee statement**, **weekly timetable**, **unit catalogue**, **programme office**, and **student-support processes**.",
      "I’m not confident that the demo data supports that question. Please rephrase it with the service you need—for example, **Finance**, **Admissions**, **AMS**, **Examinations**, **Library**, or a specific **unit code**.",
    ];
    const content = `${variants[fallbackIndex % variants.length]}\n\n_The live RAG assistant will search approved university documents before answering._`;
    fallbackIndex += 1;
    persist();
    return { content, title: "Outside current demo scope" };
  };
  const selectScenario = (question) => {
    const input = normalise(question);
    let best;
    let bestScore = 0;
    for (const scenario of data.scenarios) {
      let score = 0;
      for (const keyword of scenario.keywords) {
        const term = normalise(keyword);
        if (input.includes(term)) score += Math.max(2, term.split(" ").length * 2);
      }
      if (score > bestScore) { best = scenario; bestScore = score; }
    }
    if (bestScore >= 2) return best;
    return isContextualFollowUp(input) ? data.scenarios.find((scenario) => scenario.id === activeScenarioId) : undefined;
  };

  const answerFor = (question) => {
    const input = normalise(question);
    if (/timetable|class schedule|my classes|my lectures|class.*today|today.*class|lecture.*today|today.*lecture|what.*(monday|tuesday|wednesday|thursday|friday)|when is.*(class|lecture)/.test(input)) return timetableAnswer(input);
    if (/my fee|school fee|fee balance|fees balance|assigned fee|fee statement|outstanding fee|pending fee|amount.*school fee|how much.*(pay|owe|pending)/.test(input)) return feeAnswer();
    if (/apply.*(other|another|additional|extra).*(unit|course)|add.*(unit|course)|take.*extra.*(unit|course)|register.*additional.*(unit|course)|change.*units/.test(input)) return additionalUnitsAnswer();
    if (/units available|available units|my units|which units|what units|show.*units|course units|subjects available|units.*register|register.*units/.test(input)) return unitsAnswer();
    if (/where.*lecturer|lecturer.*(office|contact|email|phone|find)|lectures office|lecture office|faculty office|programme office|program office|unit coordinator/.test(input)) return academicContactAnswer();
    if (/apply.*(join|school|strathmore|admission)|join.*(school|strathmore)|new (student|user)|how.*admission|prospective student|enrol.*strathmore|enroll.*strathmore/.test(input)) return admissionsAnswer();
    if (isCapabilityQuestion(input)) {
      return {
        content: "I can help you explore Strathmore University services across **20 demonstration topics**, including:\n\n- Fees, payment methods, and financial clearance\n- Semester registration, units, and prerequisites\n- Academic advising, examinations, and results\n- Transcripts, deferment, and graduation clearance\n- AMS access, student email, and library services\n- Counselling, accommodation, clubs, and campus contacts\n\nYou can ask a complete question such as **“How do I register for the semester?”** or **“Where can I get academic advising?”**\n\n_This preview uses demonstration guidance. The live AI will use approved SU documents and connected university systems._",
        title: "SU Assistant capabilities",
      };
    }
    if (authProfile && /who am i|my profile|my programme|my program|my department|my year|my role|about me/.test(input)) {
      const detail = authProfile.role === "staff"
        ? `You are signed in as **${authProfile.fullName}**, a **Staff** user${authProfile.department ? ` in **${authProfile.department}**` : ""}.`
        : `You are signed in as **${authProfile.fullName}**, a **Student** user${authProfile.programme ? ` in **${authProfile.programme}**` : ""}${authProfile.yearOfStudy ? `, Year **${authProfile.yearOfStudy}**` : ""}.`;
      return { content: `${detail}\n\nI can use this profile to tailor demonstration guidance, but I cannot access private AMS records yet.`, title: "Your demo profile" };
    }
    const scenario = selectScenario(question);
    if (!scenario) {
      return fallbackAnswer();
    }
    activeScenarioId = scenario.id;
    let content = scenario.response;
    if (/document|requirement|what do i need|need to bring|evidence/.test(input)) content = scenario.requirements;
    else if (/what next|next step|how do i|how can i|process|steps|then/.test(input)) content = scenario.nextSteps;
    else if (/who|contact|office|where|phone|email|help me/.test(input)) content = scenario.contact;
    if (authProfile) {
      const context = authProfile.role === "staff"
        ? `Personalised for **${authProfile.fullName}** as a **Staff** user${authProfile.department ? ` in **${authProfile.department}**` : ""}.`
        : `Personalised for **${authProfile.fullName}** as a **Student** user${authProfile.programme ? ` in **${authProfile.programme}**` : ""}${authProfile.yearOfStudy ? `, Year **${authProfile.yearOfStudy}**` : ""}.`;
      content = `${context}\n\n${content}`;
    }
    content += `\n\nYou can ask a follow-up such as **“What do I need?”**, **“What should I do next?”**, or **“Which office handles this?”**\n\n_${data.notice}_`;
    persist();
    return { content, title: scenario.title };
  };

  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

  window.fetch = async (input, init = {}) => {
    const target = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    const url = new URL(target);
    if (url.origin !== "https://preview.local") return originalFetch(input, init);
    if (init.method === "POST" && url.pathname === "/v1/sessions") {
      return json({ id: sessionId, owner_subject: "preview", messages, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, 201);
    }
    if (init.method !== "POST" && url.pathname === `/v1/sessions/${sessionId}`) {
      return json({ id: sessionId, owner_subject: "preview", messages, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    if (init.method === "POST" && url.pathname.endsWith("/messages")) {
      const question = JSON.parse(init.body).content;
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      const answer = answerFor(question);
      const message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer.content,
        created_at: new Date().toISOString(),
        citations: [{ id: crypto.randomUUID(), title: answer.title }],
      };
      messages.push(
        { id: crypto.randomUUID(), role: "user", content: question, created_at: new Date().toISOString(), citations: [] },
        message,
      );
      persist();
      return json({ session_id: sessionId, message });
    }
    return json({ detail: "Preview route not found" }, 404);
  };

  const chat = document.querySelector("#student-assistant");
  if (authProfile) {
    chat.setAttribute("welcome-message", `Hello ${authProfile.fullName}! I’m ready to help with ${authProfile.role === "staff" ? "staff and university processes" : "your studies and student support"}. You can also ask “Who am I?” to check your profile.`);
  }
  chat.tokenProvider = () => window.SU_AUTH?.getToken() ?? "preview-only-token";
  chat.setReady();
  bindLaunchers(chat);
}
