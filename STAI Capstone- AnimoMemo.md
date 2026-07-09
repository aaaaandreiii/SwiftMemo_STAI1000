# **AI-Powered Help Desk Announcement (HDA) Assistant**

### **Technical Functionality & Business Case Writeup**

---

## **1\. Executive Summary**

University Help Desk Announcements (HDAs) are the primary channel institutions use to communicate deadlines, policy changes, and procedural updates to students. In practice, this channel is failing: students report being overwhelmed by volume, unable to distinguish urgent items from noise, and frequently missing deadlines as a direct result. This creates a measurable, recurring cost — in missed opportunities for students and in repeated support-ticket load for administrative staff.

**SwiftMemo** addresses the gap with a full-stack, agentic AI application that ingests raw HDA email updates, classifies them by category and origin, extracts structured summaries with a LangGraph ReAct agent, verifies dates against a calendar tool, and exposes the resulting knowledge base through a retrieval-augmented (RAG) chatbot — all while logging performance data through MLflow for continuous improvement. The following sections lay out the functional design, the market evidence justifying it, the existing competitive landscape, and the business case for adoption.

---

## **2\. The Problem: Evidence of a Communication Gap**

**2.1 Information overload is documented, not anecdotal.** Independent research on university-to-student email finds that an "overload" of institutional messages causes important notices to get buried, leading students to disengage from their inbox entirely rather than read selectively. Interview-based studies of students and staff found that mass "Dear Student" announcements were frequently dismissed as noise, while messages tied to a specific, familiar sender were more likely to be read, meaning generic HDA broadcasts are structurally disadvantaged from the moment they're sent. ([Times Higher Education, Jan 2025](https://www.timeshighereducation.com/news/students-feel-spammed-overload-university-emails); [Inside Higher Ed, Jan 2025](https://www.insidehighered.com/news/students/2025/01/17/students-feel-spammed-overload-university-emails))

**2.2** The cost is measurable in missed deadlines. A recent campus-communication survey found that 89% of respondents admitted to missing an important event, deadline, or opportunity because of poor communication visibility. This may be because the volume and format of the messaging didn't match how they are used to processing information. ([HootBoard, "The Campus Communication Crisis," Apr 2025](https://about.hootboard.com/education/campus-communication-crisis-students-ignore-emails-universities-can/))

**2.3 The underlying inbox-fatigue pattern is broader than higher education.** Cross-industry survey data shows email overload is now a recognized productivity and wellbeing problem: roughly seven in ten professionals name email as their top workplace stressor, a large share describe their inbox as "out of control," and researchers estimate meaningful attention and productivity loss from interruption-driven email processing. Students inherit this same failure mode, compounded by the fact that they have far less discretion than employees over which institutional messages they can simply ignore — a missed deadline is not equivalent to a missed newsletter. ([Readless, "Email Overload Statistics 2026," aggregating Mailbird, Clean Email, and Poppulo survey data](https://www.readless.app/blog/email-overload-statistics))

**2.4 The gap is a filtering and structuring problem, not a volume problem.** Roughly half of institutions have already invested in some form of chatbot licensing or homegrown bot infrastructure, indicating administrators recognize the need for a better interface layer — but the underlying announcements themselves remain unstructured, unfiltered free text. The unmet need is not "more communication," it's **automated triage, extraction, and retrieval** on top of the communication that already exists. ([DemandSage, "AI in Education Statistics," 2026](https://www.demandsage.com/ai-in-education-statistics/))

---

## **3\. Market Opportunity**

**3.1 AI-in-education is a fast-growing, still-early category.** Market estimates vary by research house, but they converge directionally: the global AI-in-education market was valued in the roughly **$5.5–8.3 billion range in 2025**, with most analysts projecting **CAGR in the 25–41% range through the early 2030s**, pushing the category toward the $30–70 billion range by the early-to-mid 2030s depending on methodology. Higher education specifically is called out as the largest end-use segment in several of these reports, and North America currently holds the largest regional share while Asia-Pacific is the fastest-growing region. ([Grand View Research, 2026](https://www.grandviewresearch.com/industry-analysis/artificial-intelligence-ai-education-market-report); [SNS Insider, 2026](https://www.globenewswire.com/news-release/2026/05/22/3300198/0/en/ai-in-education-market-size-to-grow-70-55-billion-by-2035-sns-insider.html); [ResearchAndMarkets via GlobeNewswire, Apr 2026](https://finance.yahoo.com/sectors/technology/articles/global-10-6b-ai-education-163600564.html))

**3.2 Adoption on the student side has already normalized AI as an academic tool.** Multiple 2025–2026 surveys report that the share of students using AI tools in their coursework jumped sharply year over year (commonly cited in the 66%→92% range across 2024–2025), and a large share of institutions in Europe and North America now have or are actively developing formal AI-use guidance. This indicates the target user base is primed to adopt an AI-mediated interface for administrative information — the barrier is institutional tooling, not student willingness. ([Programs.com, "The Latest AI in Education Statistics," 2026](https://programs.com/resources/ai-education-statistics/); [Engageli, citing UNESCO 2025 and OECD 2026 reports](https://www.engageli.com/blog/ai-in-education-statistics))

**3.3 RAG is the emerging standard for grounding institutional AI, for good reason.** Enterprise research on retrieval-augmented generation reports substantial reductions in hallucination rates when responses are grounded in a verified corpus rather than left to a model's parametric memory — estimates range from roughly a third to roughly half fewer hallucinated claims depending on domain and study design, and double-digit F1 accuracy gains on domain-specific QA tasks. For a use case like ours — answering questions about official university policy — ungrounded generation is a liability (a hallucinated deadline is worse than no answer), which is exactly the failure mode RAG is designed to close. This is also why the system draws from a combination of a ChromaDB vector store (for semantic retrieval of document chunks) and a SQLite relational database (for structured metadata and session tracking), grounding answers in verified historical announcements rather than open-domain generation. ([Forbes Councils, "How RAG Could Solve AI's Hallucination Problem," Jun 2025](https://www.forbes.com/councils/forbestechcouncil/2025/06/23/how-retrieval-augmented-generation-could-solve-ais-hallucination-problem/); [Journal of Future Artificial Intelligence and Technologies, 2026](https://faith.futuretechsci.org/index.php/FAITH/article/view/297))

---

## **4\. Existing Solutions & How We're Different**

The market already has two adjacent categories of tooling. Neither one covers the specific gap this system is built for.

### **4.1 Category A — Higher-Ed Student Engagement Chatbots**

Vendors like **Ivy.ai**, **Ocelot**, **Mainstay (formerly AdmitHub)**, and **Element451's BoltBot** are well-funded, established platforms (Mainstay alone has raised over $30M; Ocelot serves 470+ schools and 5.6M students) used by hundreds of institutions. ([ListEdTech, 2022](https://www.listedtech.com/blog/chatbots-in-higher-education/); [CloudTalk, 2026](https://www.cloudtalk.io/blog/best-ai-voice-agents-for-student-enrollment/))

* **What they're built for:** admissions, enrollment, financial aid, and general FAQ deflection — reducing call-center volume and improving enrollment yield. Temple University, for example, cut support calls by half after deploying Ivy.ai. ([Kaily, 2026](https://www.kaily.ai/blog/best-college-admission-chatbots))  
* **Where they fall short for this use case:** independent comparisons note that tools like Ivy.ai often function as a "sophisticated FAQ finder" that points students to links rather than synthesizing answers from dense, interrelated policy documents, and that specialists like Ocelot are narrow-scope by design (e.g., financial-aid-only), requiring costly custom development to extend elsewhere. ([Wonderchat, 2026](https://wonderchat.io/blog/ai-chatbots-university-support)) None of these platforms are built to continuously *ingest, validate, and structure* a live stream of day-to-day operational announcements (HDAs) — they're built around a largely static, pre-loaded knowledge base plus CRM/SIS integrations.  
* **Cost model:** enterprise, custom pricing, multi-department implementation projects that can take weeks and require coordination across IT, registrar, and student services. ([Enrollify, 2020](https://www.enrollify.org/blog/a-review-of-the-top-chatbot-tools-for-higher-education)) This puts them out of reach for a department-level or resource-constrained deployment.

### **4.2 Category B — General-Purpose AI Email Assistants**

Tools like **Superhuman**, **Shortwave**, **Microsoft Copilot (Outlook)**, and **Google Gemini (Gmail)** summarize threads and surface action items inside a personal inbox. ([Fyxer, 2026](https://www.fyxer.com/blog/ai-email-summarization-tools); [alfred\_, 2026](https://get-alfred.ai/blog/best-ai-assistant-for-email-summaries))

* **What they're built for:** individual productivity — drafting replies, prioritizing a personal inbox, summarizing a thread on request.  
* **Where they fall short for this use case:** they are reactive (a person must open a thread to get a summary), they have no institutional filtering layer to reject spam or non-official senders, they don't verify factual claims like dates against an external source of truth, and critically, they have **no shared, queryable knowledge base** — a summary lives in one person's inbox and isn't retrievable by other students asking the same question later. They also were never designed for the trust requirements of official policy communication: reviewers note that even enterprise tools like Copilot inherit "every security gap beneath" the platform they're layered on, and are explicitly scoped as personal assistants, not institutional systems of record. ([Forbes, 2026](https://www.forbes.com/sites/technology/article/how-to-use-ai-agents-for-emails/))

### **4.3 Where This System Sits**

This system occupies the gap between the two categories: it has the **domain specificity and trust requirements of a higher-ed platform** (Category A) combined with the **deep, agentic email-processing capability of a modern AI email tool** (Category B) — but purpose-built for the specific job neither category does well: turning a continuous stream of raw institutional announcements into a validated, structured, retrievable knowledge base.

| Dimension | Category A (Ivy.ai, Ocelot, Mainstay) | Category B (Superhuman, Copilot, Gemini) | This System |
| ----- | ----- | ----- | ----- |
| Core input | Pre-loaded website/CRM content | Personal inbox threads | Live, raw HDA announcements |
| Spam / non-official filtering | Not applicable (curated content) | None | Dedicated AI validator layer |
| Structured extraction (JSON, action items) | Limited — mostly link retrieval | Freeform summary only | Strict JSON schema extraction |
| Fact verification (e.g., dates) | No | No | Agentic Calendar Check Tool |
| Shared, queryable knowledge base | Yes, but static/CRM-driven | No — personal, not shared | Yes — RAG over verified announcement history |
| Observability / LLMOps | Vendor-internal, opaque | Vendor-internal, opaque | Open, integrated MLflow tracking |
| Deployment cost | Enterprise, custom pricing, multi-week rollout | Consumer/team subscription | Free/local-first dev, low-cost cloud toggle for production |

### **4.4 Who's Actually Paying For Existing Solutions?**

This matters because it tells us who the real buyer is, and it's a useful reality check on the size of the gap this system fills.

* **Category A (institutional chatbot vendors) is a B2B/B2G sale, paid by the institution, not the student.** Pricing across Ivy.ai, Ocelot, and Mainstay is uniformly "custom, based on institution size" — sold as an annual enterprise contract negotiated with IT, student affairs, or enrollment management, typically bundled with a multi-week implementation project spanning several departments. ([Enrollify, 2020](https://www.enrollify.org/blog/a-review-of-the-top-chatbot-tools-for-higher-education); [CloudTalk, 2026](https://www.cloudtalk.io/blog/best-ai-voice-agents-for-student-enrollment/)) That means the buyer is a university administration with an enrollment/retention budget to defend — not a bottom-up, individual purchase.  
* **Category B (AI email assistants) is a B2C/B2B-seat sale, paid by the individual or their employer.** Superhuman runs $30/seat/month, Shortwave $7–30/month depending on tier, and Copilot is a $30/user/month add-on to an existing Microsoft 365 subscription. ([Sintra, 2026](https://sintra.ai/blog/superhuman-alternatives); [Zapier, 2026](https://zapier.com/blog/shortwave-vs-superhuman/)) Nobody is buying these on behalf of an entire student body — they're professional productivity tools, priced and marketed for individual knowledge workers.  
* **The takeaway:** both categories validate that people (institutions *and* individuals) are willing to pay real money to solve adjacent problems — institutional engagement and personal inbox overload, respectively. That's a healthy signal the underlying pain is real. But neither category has a product priced or scoped for the specific buyer this system targets: a department (e.g., a registrar's office, an IT help desk, or even a single college within a university) that wants a low-cost, narrowly-scoped tool for one specific communication stream, without the six-figure enterprise contract of Category A or the per-seat personal-productivity framing of Category B. That's the underserved middle this system is aimed at — and the local-first/low-cost architecture in section 6 is a direct response to that gap, not just a student-budget convenience.

### **4.5 Sanity Check: "Why Can't I Just Use ChatGPT?"**

This is the right question to ask before building anything agentic, and it deserves an honest answer rather than a dismissive one — especially since today's frontier chatbots (ChatGPT, Claude, Gemini) are already multimodal and can translate between languages out of the box, so "can an LLM read and summarize an email" is not, by itself, a justification for a custom system.

The honest answer is that **the raw language capability was never the hard part.** Any modern chatbot can summarize a single pasted email as well as this system's extraction agent can, in isolation. What a consumer chatbot session cannot do is the *systems engineering* around that capability:

1. **No unattended, continuous ingestion.** ChatGPT doesn't watch an inbox and act on new mail as it arrives — a human has to open the app and paste each email in, every time, for every announcement. This system is designed to run as an unattended pipeline over a live stream of institutional email, which is the entire point: nobody wants (or has time) to manually paste hundreds of HDAs into a chat window over a semester.  
2. **No shared, persistent, queryable knowledge base.** A ChatGPT conversation is scoped to one user's session (or, at best, that one user's account memory). It cannot serve as a single, shared source of truth that an entire student body queries — every student would need to build their own chat history from scratch, with no way to benefit from announcements another student already asked about. The RAG \+ ChromaDB layer in section 6.1.2 exists specifically to be that shared, durable institutional resource.  
3. **No enforced grounding or citation discipline.** A generic ChatGPT session can and does hallucinate — it has no built-in requirement to only answer from a verified, curated source and to cite the specific announcement (subject \+ date) it pulled a claim from. That enforcement is a deliberate prompt- and architecture-level constraint in this system (section 6.1.2), not a default behavior of a general-purpose assistant.  
4. **No independent fact verification.** Nothing about a stock ChatGPT session forces it to check a stated deadline against an actual calendar before repeating it back to a user. This system's `calendar_check` tool call (section 6.1.1) is a deliberate, non-optional step precisely because relative language ("due tomorrow," "in 3 days") is exactly where an ungrounded LLM is most likely to be confidently wrong.  
5. **No institutional audit trail.** There is no way for a university IT department to see, in aggregate, what a body of students individually asked ChatGPT, whether answers were accurate, or what it cost — there's no equivalent of the MLflow logging in section 6.1.1 for a personal ChatGPT account. That observability is a hard requirement for any institution deciding whether to officially endorse a tool for communicating deadlines and policy.  
6. **A real data-governance problem.** Pasting official (and sometimes personally identifiable) university communications into a personal, consumer ChatGPT account is exactly the "shadow AI" risk that security researchers have flagged as a growing enterprise liability — consumer accounts have no institutional access controls, no data processing agreement, and, depending on ongoing litigation, may retain conversation data for longer than users expect. Nearly three-quarters of workplace ChatGPT usage happens through personal, non-corporate accounts with none of those protections. ([IntuitionLabs, 2026](https://intuitionlabs.ai/articles/prevent-chatgpt-proprietary-data-leaks); [Concentric AI, 2026](https://concentric.ai/is-chatgpt-secure-10-prompts-you-dont-want-your-employees-trying-with-chatgpt/)) An institution cannot responsibly tell its entire student body to paste official announcements into a personal AI account as its communication strategy.

**In short:** the justification for this system isn't "ChatGPT can't summarize an email" — it obviously can. The justification is that summarizing one email on request is a completely different problem from continuously, reliably, and verifiably turning a live institutional communication stream into a trustworthy shared resource for thousands of people. That's an infrastructure and governance problem, not a raw-capability problem, and it's the reason this isn't just "a ChatGPT wrapper."

### **4.6 Is This Actually a Good Fit for Agentic AI? (An Honest Self-Assessment)**

It's worth being precise here rather than reflexively calling everything "agentic" because that word is currently doing a lot of marketing work industry-wide. Looking at the three subsystems in section 6.1 individually:

* **The guardrail layer (6.1.3) is *not* meaningfully agentic** — it's a single zero-shot classification call with a structured output. That's a deliberate and correct engineering choice, not a shortcoming: using a cheap, single-step classifier to gate a more expensive pipeline is exactly the right amount of complexity for a binary "is this real" decision, and dressing it up as "agentic" would just be inflating the pitch.  
* **The RAG chat layer (6.1.2) is agentic only in a limited sense** (it maintains conversational state and reformulates queries), but a single retrieve-then-generate turn is standard RAG, not autonomous multi-step reasoning.  
* **The extraction pipeline (6.1.1) is where agentic behavior genuinely earns its place.** It requires the model to reason about what it doesn't yet know (the current date), decide to invoke a tool to get it, incorporate that tool result into further reasoning, and then commit to a structured output — with a fallback loop if that output is malformed. That's a real multi-step, tool-using decision process, not a single prompt-response pair, and it's precisely the class of problem (ambiguous inputs requiring an external, verifiable action before an answer can be trusted) that agentic architectures are actually built for, as opposed to a case where a single well-crafted prompt would do just as well.

The honest framing for a paper or pitch is therefore **not** "this whole system is agentic AI" but rather: *this system uses agentic (tool-using, multi-step) reasoning specifically where verification against ground truth is required, and simpler techniques (rule-based checks, single-call classification, standard RAG) everywhere else — which is itself the argument for the design, not a hedge against it.* A reviewer who asks "did you actually need an agent here, or could a script have done it?" should come away seeing that the team made that call deliberately per-component, rather than defaulting to "agent" as a buzzword.

---

## **5\. Functional Overview**

| \# | Capability | What it does | Why it matters (business impact) |
| ----- | ----- | ----- | ----- |
| 1 | **AI-Powered Email Summarization** | A LangGraph ReAct agent parses raw, unstructured HDA text and outputs clean, strictly-formatted JSON summaries, surfacing action items, deadlines, and procedural changes. | Converts unstructured institutional noise into a queryable, structured asset — directly targeting the "buried important messages" failure mode documented in section 2\. |
| 2 | **Automated Guardrails & Classification** | An AI validator layer screens incoming messages to classify them by type (e.g., institutional announcements, LMS/Canvas notifications, service alerts, and personal updates) and filters out technically unprocessable (e.g., empty or unreadable) records. | Ensures only valid, readable data enters the pipeline and tags content with appropriate context to maintain high data quality. |
| 3 | **Context-Aware Policy Chatbot (RAG)** | A conversational interface with session memory (persisted in SQLite) retrieves answers from a ChromaDB vector store of processed email updates. | Directly answers the accessibility gap: instead of searching through buried emails, students query in natural language and get grounded, sourced answers. |
| 4 | **Agentic Tool Use** | The agent is equipped with a Calendar Check Tool to actively verify dates mentioned in announcements rather than passively trusting the text. | Adds a verification layer that generic LLM summarizers lack — reduces the single highest-risk failure mode (a wrong deadline) identified in section 2.2. |
| 5 | **LLMOps & Observability** | MLflow tracks latency, prompt/response artifacts, and token usage across the pipeline. | Gives the team (and any future institutional buyer) visibility into system reliability and cost — a prerequisite for scaling past a prototype and for any procurement conversation with IT. |
| 6 | **Flexible LLM Environments** | Runs on free local models via Ollama (e.g., qwen2.5) during development, with an environment-variable toggle to Google Gemini for production. | Keeps development costs near zero while preserving a clear, low-friction path to a production-grade cloud model — relevant to any budget-constrained deployment such as a public university. |

---

## **6\. Technical Architecture**

The system is a full-stack AI application composed of the following layers:

* **Frontend:** React single-page application built with Vite, TypeScript, Tailwind CSS v4, and Radix UI components for a modern, responsive user experience.    
* **Backend:** FastAPI server exposing endpoints such as `/api/ingest, /api/process, /api/chat, /api/summaries, /api/profile, /api/preferences, /api/draft, and /api/topics/suggestions`  to handle ingestion, processing, chat queries, user preferences, profiles, draft replies, and daily digests.  
* **AI Agent Layer:** A LangGraph ReAct agent responsible for data extraction and tool-augmented reasoning (e.g., calendar verification).  
* **Memory & Storage:** SQLite database for structured data persistence (user preferences, user profiles, chat history/memory, ingestion history, and summaries) and ChromaDB vector database for RAG retrieval embeddings.   
* **LLM Integration:** Ollama-hosted local models (qwen2.5) by default for cost-free development; Google Gemini (gemini-1.5-flash) for production/demo scenarios via a simple config toggle.  
* **Observability:** MLflow integration tracking latency, token usage, and prompt/response artifacts across the pipeline.

This architecture cleanly separates ingestion, validation, extraction, retrieval, and observability into distinct, swappable components — meaning any layer (e.g., swapping Gemini for another provider, or ChromaDB for another vector store) can be replaced without a system rewrite. That modularity is itself a business asset: it de-risks vendor lock-in and keeps the total cost of ownership predictable as the system scales from a class project to a pilot deployment.

### **6.1 Implementation Deep Dive**

The high-level architecture above is backed by three concrete engineering subsystems. Each one directly closes a specific failure mode identified in section 2 (buried announcements, unverified deadlines, spam/noise) and section 4 (the gaps left open by existing chatbot and email-AI vendors).

**6.1.1 Agentic Extraction (`backend/agent.py` — LangGraph ReAct Agent)**

This is the component that actually converts a raw HDA email into a trustworthy, structured record.

* **ReAct reasoning with a mandatory calendar tool.** The agent runs on a ReAct (Reasoning and Acting) loop and is equipped with a `calendar_check` tool built on Python's `datetime` and `zoneinfo` to fetch the current timezone-aware date. Critically, the system prompt forces the agent to call this tool *before* attempting extraction, so relative language like "submit by tomorrow" or "due in 3 days" is resolved against a real, timezone-correct clock rather than the model guessing at a date. This is the direct engineering answer to the single biggest institutional risk flagged in section 2.2 and section 4.2: a wrong deadline confidently stated is worse than no answer at all, and none of the general-purpose email assistants profiled in section 4.2 do this kind of active verification — they summarize text as written, without checking it against anything.  
* **Strict structured outputs.** The LLM is constrained to return a fixed JSON schema containing the fields `title`, `summary`, `deadline_date`, `category`, and `urgency_score` (an integer from 1 to 5), rather than freeform prose. This is what makes the output usable downstream (searchable, filterable, chartable) instead of just another wall of text, which is the core limitation of Category A chatbots per section 4.1 (they surface links, not synthesized structured facts).  
* **Self-healing fallback.** If the agent fails to produce valid, parseable JSON on the first pass, a secondary `structured_output_repair` LLM call is automatically triggered — it receives the broken output plus the original email and is prompted specifically to fix the syntax without human intervention. If both LLM extraction and repair attempts fail, the system falls back to a deterministic Python-based parser (`heuristic_extract_summary`) using regex to extract metadata and guarantee a valid structured schema is always produced without pipeline failures.  
* **Built-in telemetry.** Every graph invocation is wrapped in a `telemetry_run` context manager that logs the prompt, the agent's internal reasoning/tool-call steps, the final response, and token metrics directly to MLflow. This closes the loop with the LLMOps capability described in section 5 (\#5) — it's not just "we have MLflow," it's that every single extraction is individually auditable, which is a prerequisite for any IT department evaluating whether to trust the system with official communications.

**6.1.2 RAG & Relational Database Pipeline (`backend/rag.py`)**

This is the component that turns the extracted knowledge into something users can actually query, and it's engineered specifically to avoid the failure modes RAG is prone to: duplicate index nodes and losing conversational context.

* **SQLite Relational Integration & Session memory.** All structural entities—including processed emails, triage summaries, categories, user profiles, and multi-turn chat history (`chat_messages` table)—are stored in a local SQLite database (`backend/database.py`). This guarantees data integrity and allows the application to handle stateful, personal configurations separately from semantic retrieval.    
* **Chunking with duplicate-safe IDs.** Text is chunked at a fixed size (850 characters, 120-character overlap) and each chunk is assigned a stable ID generated from a SHA1 hash of its content. This means restarting the ingestion pipeline never creates duplicate entries in ChromaDB — a small detail, but one that directly protects long-term data quality and prevents the same announcement from being retrieved multiple times in a single answer.  
* **Conversation-aware retrieval.** Rather than embedding the user's raw question in isolation, a `_history_to_text` function prepends the last 3 conversational turns (Q\\\&A pairs) from the chat history stored in SQLite before the query is embedded and searched. This is what allows natural multi-turn interaction ("when is that due?" after a previous question about a specific policy) instead of forcing every question to be a standalone, fully-specified query — a usability gap that plain FAQ-style chatbots (section 4.1) typically don't handle well.  
* **Grounded generation with citations enforced at the prompt level.** Retrieved chunks are passed into the context window along with their metadata (subject line, date), and the `RAG_SYSTEM_PROMPT` explicitly instructs the model to use only the retrieved context and to cite the subject and date of its sources. This is the concrete mechanism behind the hallucination-reduction claims cited in section 3.3 — grounding isn't just "the model has access to documents," it's an enforced behavioral constraint that every answer must be traceable back to a specific, dated announcement.

**6.1.3 LLM Guardrails & Classification Gatekeeper (`backend/guardrails.py`)**

This is a lightweight pre-processing layer that classifies and validates emails before the more expensive agentic extraction step.

* **Zero-shot email classification.** Before an email is processed by the ReAct agent, it is sent to the LLM to classify its category and processability. To support personal, promotional, and LMS notifications, the validator classifies all readable emails as valid/processable (`is_valid=True`), distinguishing them by their `email_kind` (e.g., `institutional`, `academic`, `personal`, `promotional`, `lms_notification`, etc.) rather than rejecting non-institutional emails.  
* **Structured, auditable classifications.** The validator's output is a fixed JSON object—`{"is_valid": bool, "reason": str, "confidence": float, "is\_institutional": bool, "email\_kind": str}`—ensuring that every email's classified kind and confidence score are logged in SQLite for audit trails.  
* **Pipeline short-circuiting for unprocessable inputs.** If an email is empty or unreadable (`is_valid` is `false`), the system immediately raises a `ValueError` and saves the record in SQLite without calling the LangGraph ReAct agent. This short-circuiting is a direct cost and latency optimization that prevents burning tokens on corrupt or unreadable inputs

Together, these three subsystems form a defense-in-depth pipeline — a rule-based sender check, an LLM-based content classifier, an agent that verifies its own factual claims against a real clock, and a self-repair mechanism for malformed output — that is substantially more rigorous than either a static FAQ chatbot (section 4.1) or a personal email summarizer (section 4.2) needs to be, precisely because it's designed to be trusted as an institutional system of record rather than a personal convenience tool.

### **6.2 Deployment & Dockerization**

To ensure consistent execution environments across development, testing, and production, the entire system is fully containerized using Docker and orchestrated with Docker Compose. This architecture simplifies the deployment of the multi-container application by abstracting away OS-level dependencies and configuring internal networking automatically.

* **API Backend & LLM Orchestration (`api` service):**
  The core FastAPI application and LangGraph agent pipeline run in a dedicated container built from a lean `python:3.11-slim` base image. It manages the runtime context by installing dependencies specified in `requirements.txt`. Essential runtime data like the SQLite relational database (`swiftmemo.db`) and ChromaDB vector store are mounted as external local volumes to persist state across container restarts. Furthermore, it takes configuration via environment variables to dynamically route to different LLM providers (e.g., local Ollama endpoints or remote Gemini APIs).

* **Frontend UI (`frontend` service):**
  The web-based frontend runs in its own isolated container, building from the specific frontend Dockerfile. Docker Compose manages the networking proxy configurations (`VITE_API_PROXY_TARGET`), allowing the frontend on port `7860` to securely communicate with the internal `api` service without requiring complex cross-origin setups. It utilizes Docker's `depends_on` functionality combined with a healthcheck to guarantee that the frontend starts only when the backend API is fully healthy and ready to accept traffic.

* **MLOps Tracking (`mlflow` service):**
  To facilitate model observability, prompt experimentation, and system evaluations, an MLflow tracking server is deployed as an adjacent service using the same backend Dockerfile context. This tracking server operates locally with an SQLite backend (`mlflow.db`) and maps its tracking UI to port `5001`. The `api` service automatically logs pipeline traces to this container via the internal Docker network.

This containerized approach reduces the "it works on my machine" friction during collaborative development and establishes a reliable, repeatable baseline for deploying the application to cloud infrastructure.

---

## **7\. Business Case Summary**

1. **Addresses a documented, quantified pain point.** Section 2 shows the failure mode (buried announcements → missed deadlines) is independently confirmed by academic research and campus-communication surveys, not assumed.  
2. **Rides a fast-growing, still-underserved category.** AI-in-education spend is growing at a CAGR that most analysts place well above 25% annually, and higher-education institutions are already investing in chatbot infrastructure — but the specific "structure and verify live operational announcements" niche remains open, as shown in section 4\.  
3. **Fills a real gap between two existing product categories.** Section 4 shows that neither institutional chatbot vendors nor general AI email tools solve this specific problem — one is too broad and enterprise-priced, the other has no shared institutional knowledge base or verification layer.  
4. **Grounded answers reduce institutional risk.** By restricting the chatbot's knowledge to a verified, filtered corpus (rather than open generation), the system minimizes the single greatest liability of an institutional AI tool: confidently wrong information about deadlines or policy.  
5. **Cost-conscious by design.** The local-first, cloud-optional LLM strategy means a resource-constrained institution (or a student team building this without funding) can develop and pilot the system at near-zero marginal API cost, then scale to a cloud model only once value is demonstrated.  
6. **Built for accountability, not just a demo.** MLflow observability turns "does the AI actually work well" from an anecdotal question into a measurable one — a necessary feature for any real institutional buyer or IT department evaluating adoption.

---

## **8\. Limitations & Honest Caveats**

* Market-size figures for "AI in education" vary considerably across research providers (estimates in this document range from \~$5.5B to \~$8.3B for the 2025 base year alone), reflecting differences in scope and methodology — they should be treated as directional evidence of strong growth, not precise figures.  
* RAG substantially reduces, but does not eliminate, hallucination risk; system design (validator layer \+ calendar tool \+ grounded retrieval) mitigates this but does not make the system infallible, and this should be represented honestly in any pitch or paper.  
* Current evidence for adoption readiness (e.g., chatbot licensing rates, student AI usage) is drawn largely from U.S. and European institutional surveys; Philippine-specific higher-education adoption data is comparatively scarce, and localized validation (e.g., a small user study at the target university) would meaningfully strengthen the business case.  
* The competitive comparison in section 4 is based on vendor marketing material and third-party review sites rather than hands-on evaluation of Ivy.ai, Ocelot, or Mainstay — worth validating directly with a demo/trial before citing in a formal paper.  
* Section 6.1 (Implementation Deep Dive) is drawn directly from the project's own source files (`backend/agents.py`, `backend/rag.py`, `backend/guardrails.py`, `backend/database.py`), not from external research — it documents what the system actually does rather than a market claim, and needs no external citation.

---

## **Sources Referenced**

**Communication gap / email overload**

* Times Higher Education (Jan 2025), ["Students feel 'spammed' by 'overload' of university emails"](https://www.timeshighereducation.com/news/students-feel-spammed-overload-university-emails)  
* Inside Higher Ed (Jan 2025), ["Students feel 'spammed' by 'overload' of university emails"](https://www.insidehighered.com/news/students/2025/01/17/students-feel-spammed-overload-university-emails)  
* HootBoard (Apr 2025), ["The Campus Communication Crisis: Why Students Ignore Emails & What Universities Can Do About It"](https://about.hootboard.com/education/campus-communication-crisis-students-ignore-emails-universities-can/)  
* Readless (2026), ["Email Overload Statistics 2026"](https://www.readless.app/blog/email-overload-statistics) (aggregating Mailbird, Clean Email, Poppulo survey data)

**Market size / adoption**

* DemandSage (2026), ["AI in Education Statistics"](https://www.demandsage.com/ai-in-education-statistics/)  
* Grand View Research (2026), ["AI in Education Market Size, Share and Growth Report, 2033"](https://www.grandviewresearch.com/industry-analysis/artificial-intelligence-ai-education-market-report)  
* SNS Insider via GlobeNewswire (2026), ["AI in Education Market Size to Grow $70.55 Billion by 2035"](https://www.globenewswire.com/news-release/2026/05/22/3300198/0/en/ai-in-education-market-size-to-grow-70-55-billion-by-2035-sns-insider.html)  
* ResearchAndMarkets via GlobeNewswire (Apr 2026), ["Global $10.6B AI in Education Market, 2026"](https://finance.yahoo.com/sectors/technology/articles/global-10-6b-ai-education-163600564.html)  
* Programs.com (2026), ["The Latest AI in Education Statistics"](https://programs.com/resources/ai-education-statistics/)  
* Engageli (2026), ["25 AI in Education Statistics to Guide Your Learning Strategy in 2026"](https://www.engageli.com/blog/ai-in-education-statistics) (citing UNESCO 2025 and OECD 2026 reports)

**RAG / hallucination reduction**

* Forbes Councils (Jun 2025), ["How Retrieval-Augmented Generation Could Solve AI's Hallucination Problem"](https://www.forbes.com/councils/forbestechcouncil/2025/06/23/how-retrieval-augmented-generation-could-solve-ais-hallucination-problem/)  
* Journal of Future Artificial Intelligence and Technologies (2026), ["A Review on Retrieval-Augmented Generation: Architectures, Research Challenges, and Emerging Frontiers"](https://faith.futuretechsci.org/index.php/FAITH/article/view/297)

**Existing solutions — higher-ed chatbot vendors**

* ListEdTech (2022), ["Chatbots in Higher Education are Reaching Millions of Students"](https://www.listedtech.com/blog/chatbots-in-higher-education/)  
* CloudTalk (2026), ["The 11 Best AI Voice Agents for Student Enrollment in 2026"](https://www.cloudtalk.io/blog/best-ai-voice-agents-for-student-enrollment/)  
* Kaily (2026), ["18 Best Chatbots for College Admission in 2026"](https://www.kaily.ai/blog/best-college-admission-chatbots)  
* Wonderchat (2026), ["7 Best AI Chatbots for Student Services Teams in Higher Ed"](https://wonderchat.io/blog/ai-chatbots-university-support)  
* Enrollify (2020), ["A Review of the Top Chatbot Tools for Higher Education"](https://www.enrollify.org/blog/a-review-of-the-top-chatbot-tools-for-higher-education)

**Existing solutions — general AI email assistants**

* Fyxer (2026), ["Best AI Email Summarization Tools (2026): How They Compare"](https://www.fyxer.com/blog/ai-email-summarization-tools)  
* alfred\_ (2026), ["Best AI for Email Summaries in 2026: 7 Tools Tested"](https://get-alfred.ai/blog/best-ai-assistant-for-email-summaries)  
* Forbes (2026), ["How To Use AI Agents To Streamline Email Sorting And Boost Productivity"](https://www.forbes.com/sites/technology/article/how-to-use-ai-agents-for-emails/)  
* Sintra (2026), ["We Tested the 12 Best Superhuman Alternatives in 2026"](https://sintra.ai/blog/superhuman-alternatives)  
* Zapier (2026), ["Shortwave vs. Superhuman: Which is better? \[2026\]"](https://zapier.com/blog/shortwave-vs-superhuman/)

**Consumer AI data privacy / "shadow AI" risk (ChatGPT sanity check)**

* IntuitionLabs (2026), ["ChatGPT Data Security: Preventing Proprietary Data Leaks"](https://intuitionlabs.ai/articles/prevent-chatgpt-proprietary-data-leaks)  
* Concentric AI (2026), ["ChatGPT Workplace Security: A 2026 Guide"](https://concentric.ai/is-chatgpt-secure-10-prompts-you-dont-want-your-employees-trying-with-chatgpt/)

*Note on sourcing: several market-size and adoption figures come from industry blogs and aggregator sites rather than primary research reports. Where this document cites a range, it is because different providers reported meaningfully different numbers for the same metric. For a formal thesis/paper submission, primary sources (e.g., the original Grand View Research or Statista reports, and the peer-reviewed RAG hallucination studies) should be pulled and cited directly rather than through secondary aggregators, and the vendor comparisons in section 4 should be validated against a hands-on trial or demo rather than third-party review sites alone.*

