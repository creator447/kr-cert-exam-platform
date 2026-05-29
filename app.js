(function () {
  const STORAGE_KEY = "kr-cert-exam-platform-state-v1";

  const examSelect = document.getElementById("examSelect");
  const yearSelect = document.getElementById("yearSelect");
  const roundSelect = document.getElementById("roundSelect");
  const modeSelect = document.getElementById("modeSelect");
  const startBtn = document.getElementById("startBtn");
  const solveSection = document.getElementById("solveSection");
  const wrongSection = document.getElementById("wrongSection");
  const questionCard = document.getElementById("questionCard");
  const progressTitle = document.getElementById("progressTitle");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const showWrongBtn = document.getElementById("showWrongBtn");
  const wrongSummary = document.getElementById("wrongSummary");
  const wrongList = document.getElementById("wrongList");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const apiPageInput = document.getElementById("apiPageInput");
  const apiRowsInput = document.getElementById("apiRowsInput");
  const qualgbCdSelect = document.getElementById("qualgbCdSelect");
  const fetchApiBtn = document.getElementById("fetchApiBtn");
  const apiStatus = document.getElementById("apiStatus");
  const apiList = document.getElementById("apiList");

  const state = {
    currentExamKey: "",
    mode: "sequential",
    questions: [],
    order: [],
    answers: {},
    notes: {},
    currentPointer: 0
  };

  function examKey(item) {
    return `${item.license}__${item.year}__${item.round}`;
  }

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function persist() {
    const payload = {
      currentExamKey: state.currentExamKey,
      mode: state.mode,
      answers: state.answers,
      notes: state.notes
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function parseQNetListXml(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error("응답 XML 파싱에 실패했습니다.");
    }

    const itemNodes = Array.from(doc.querySelectorAll("item"));
    const totalCountText = doc.querySelector("totalCount")?.textContent || "0";
    const totalCount = Number(totalCountText) || 0;
    const items = itemNodes.map((node) => ({
      id: node.querySelector("artlSeq")?.textContent || "-",
      title: node.querySelector("title")?.textContent || "(제목 없음)",
      qualgbnm:
        node.querySelector("qualgbNm")?.textContent ||
        node.querySelector("qualgbnm")?.textContent ||
        "-",
      seriesnm:
        node.querySelector("seriesNm")?.textContent ||
        node.querySelector("seriesnm")?.textContent ||
        "-",
      jmnm:
        node.querySelector("jmNm")?.textContent ||
        node.querySelector("jmnm")?.textContent ||
        "-"
    }));
    return { totalCount, items };
  }

  async function fetchQNetPublicList(serviceKey, pageNo, numOfRows, qualgbCd) {
    const params = new URLSearchParams({
      serviceKey,
      pageNo: String(pageNo),
      numOfRows: String(numOfRows),
      qualgbCd: qualgbCd || "T"
    });

    const res = await fetch(`/api/qnet/list?${params.toString()}`);
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.message) message = errJson.message;
      } catch (e) {
        // ignore json parse error
      }
      throw new Error(message);
    }

    const text = await res.text();
    return parseQNetListXml(text);
  }

  function renderApiList(items) {
    if (items.length === 0) {
      apiList.innerHTML = "<div class='list-item'>조회 결과가 없습니다.</div>";
      return;
    }
    apiList.innerHTML = items
      .map(
        (item) => `
          <div class="list-item">
            <strong>${escapeHtml(item.title)}</strong>
            <p>게시물ID: ${escapeHtml(item.id)}</p>
            <p>자격구분: ${escapeHtml(item.qualgbnm)} / 계열: ${escapeHtml(item.seriesnm)}</p>
            <p>종목: ${escapeHtml(item.jmnm)}</p>
          </div>
        `
      )
      .join("");
  }

  async function handleApiFetch() {
    const key = apiKeyInput.value.trim();
    const pageNo = Number(apiPageInput.value || "1");
    const numOfRows = Number(apiRowsInput.value || "10");
    const qualgbCd = qualgbCdSelect?.value || "T";

    if (!key) {
      alert("ServiceKey를 입력해주세요.");
      return;
    }
    if (pageNo < 1 || numOfRows < 1) {
      alert("페이지 번호/조회 개수는 1 이상이어야 합니다.");
      return;
    }

    apiStatus.textContent = "큐넷 API 호출 중...";
    fetchApiBtn.disabled = true;
    localStorage.setItem("qnet-service-key", key);

    try {
      const result = await fetchQNetPublicList(key, pageNo, numOfRows, qualgbCd);
      apiStatus.textContent = `호출 성공: 총 ${result.totalCount}건 중 ${result.items.length}건 표시`;
      renderApiList(result.items);
    } catch (error) {
      const isFileProtocol = window.location.protocol === "file:";
      apiStatus.textContent = isFileProtocol
        ? "호출 실패: index.html 더블클릭 대신, 터미널에서 node server.js 실행 후 http://localhost:3000 으로 접속해주세요."
        : "호출 실패: 서버 실행, ServiceKey, '국가자격 공개문제 조회 서비스' 활용신청 여부를 확인해주세요.";
      apiList.innerHTML = `<div class="list-item">오류 메시지: ${escapeHtml(error.message || "unknown")}</div>`;
    } finally {
      fetchApiBtn.disabled = false;
    }
  }

  function uniq(values) {
    return [...new Set(values)];
  }

  function fillSelect(selectEl, values, formatter) {
    selectEl.innerHTML = "";
    values.forEach((value) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = formatter ? formatter(value) : String(value);
      selectEl.appendChild(opt);
    });
  }

  function initSelectors() {
    const licenses = uniq(window.SAMPLE_EXAMS.map((e) => e.license));
    fillSelect(examSelect, licenses);
    refreshYearRoundSelectors();
  }

  function refreshYearRoundSelectors() {
    const selectedLicense = examSelect.value;
    const filtered = window.SAMPLE_EXAMS.filter((e) => e.license === selectedLicense);
    const years = uniq(filtered.map((e) => String(e.year)));
    fillSelect(yearSelect, years, (v) => `${v}년`);

    const selectedYear = yearSelect.value;
    const rounds = filtered.filter((e) => String(e.year) === selectedYear).map((e) => e.round);
    fillSelect(roundSelect, rounds);
  }

  function shuffle(array) {
    const cloned = array.slice();
    for (let i = cloned.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = cloned[i];
      cloned[i] = cloned[j];
      cloned[j] = temp;
    }
    return cloned;
  }

  function startExam() {
    const license = examSelect.value;
    const year = Number(yearSelect.value);
    const round = roundSelect.value;
    state.mode = modeSelect.value;

    const exam = window.SAMPLE_EXAMS.find(
      (e) => e.license === license && e.year === year && e.round === round
    );
    if (!exam) return;

    state.currentExamKey = examKey(exam);
    state.questions = exam.questions;
    state.order =
      state.mode === "random"
        ? shuffle(exam.questions.map((_, idx) => idx))
        : exam.questions.map((_, idx) => idx);
    state.currentPointer = 0;

    const persisted = loadPersisted();
    if (persisted.currentExamKey === state.currentExamKey) {
      state.answers = persisted.answers || {};
      state.notes = persisted.notes || {};
    } else {
      state.answers = {};
      state.notes = {};
    }

    solveSection.classList.remove("hidden");
    wrongSection.classList.remove("hidden");
    renderCurrentQuestion();
    renderWrongSummary();
    persist();
  }

  function currentQuestion() {
    const idx = state.order[state.currentPointer];
    return state.questions[idx];
  }

  function renderCurrentQuestion() {
    const q = currentQuestion();
    if (!q) return;

    const absoluteOrder = state.currentPointer + 1;
    progressTitle.textContent = `문제 ${absoluteOrder} / ${state.questions.length}`;

    const myAnswer = state.answers[q.id];
    const note = state.notes[q.id] || "";
    const solved = typeof myAnswer === "number";
    const isCorrect = solved && myAnswer === q.answerIndex;

    const optionsHtml = q.choices
      .map((choice, idx) => {
        const classes = ["option"];
        if (myAnswer === idx) classes.push("selected");
        if (solved && idx === q.answerIndex) classes.push("correct");
        if (solved && myAnswer === idx && myAnswer !== q.answerIndex) classes.push("wrong");
        return `<button class="${classes.join(" ")}" data-choice="${idx}">${idx + 1}. ${choice}</button>`;
      })
      .join("");

    questionCard.innerHTML = `
      <h3>${q.text}</h3>
      <div class="options">${optionsHtml}</div>
      ${
        solved
          ? `<p class="feedback ${isCorrect ? "ok" : "no"}">
              ${isCorrect ? "정답입니다!" : "오답입니다."}
            </p>
            <p class="explain"><strong>해설:</strong> ${q.explanation}</p>`
          : ""
      }
      <div class="note">
        <label>
          오답노트 / 메모
          <textarea id="memoInput" placeholder="이 문제에서 헷갈린 포인트를 적어두세요.">${note}</textarea>
        </label>
      </div>
    `;

    questionCard.querySelectorAll(".option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = Number(btn.dataset.choice);
        submitAnswer(q.id, choice);
      });
    });

    const memoInput = document.getElementById("memoInput");
    memoInput.addEventListener("input", () => {
      state.notes[q.id] = memoInput.value;
      persist();
    });

    prevBtn.disabled = state.currentPointer === 0;
    nextBtn.disabled = state.currentPointer >= state.questions.length - 1;
  }

  function submitAnswer(questionId, choiceIdx) {
    state.answers[questionId] = choiceIdx;
    persist();
    renderCurrentQuestion();
    renderWrongSummary();
  }

  function wrongQuestions() {
    return state.questions.filter((q) => {
      const answer = state.answers[q.id];
      return typeof answer === "number" && answer !== q.answerIndex;
    });
  }

  function renderWrongSummary() {
    const wrong = wrongQuestions();
    if (wrong.length === 0) {
      wrongSummary.textContent = "아직 오답이 없습니다.";
      wrongList.innerHTML = "";
      return;
    }
    wrongSummary.textContent = `총 ${wrong.length}문제를 틀렸습니다. 아래에서 다시 확인하세요.`;
    wrongList.innerHTML = wrong
      .map((q) => {
        const picked = state.answers[q.id];
        return `
          <div class="list-item">
            <strong>${q.text}</strong>
            <p>내 답: ${picked + 1}번 / 정답: ${q.answerIndex + 1}번</p>
          </div>
        `;
      })
      .join("");
  }

  function showWrongOnly() {
    const wrong = wrongQuestions();
    if (wrong.length === 0) {
      alert("아직 틀린 문제가 없습니다.");
      return;
    }
    const ids = wrong.map((q) => q.id);
    const indices = state.questions
      .map((q, idx) => ({ id: q.id, idx }))
      .filter((x) => ids.includes(x.id))
      .map((x) => x.idx);
    state.order = indices;
    state.currentPointer = 0;
    renderCurrentQuestion();
  }

  function bindEvents() {
    examSelect.addEventListener("change", refreshYearRoundSelectors);
    yearSelect.addEventListener("change", refreshYearRoundSelectors);
    startBtn.addEventListener("click", startExam);
    prevBtn.addEventListener("click", () => {
      if (state.currentPointer > 0) {
        state.currentPointer -= 1;
        renderCurrentQuestion();
      }
    });
    nextBtn.addEventListener("click", () => {
      if (state.currentPointer < state.order.length - 1) {
        state.currentPointer += 1;
        renderCurrentQuestion();
      }
    });
    showWrongBtn.addEventListener("click", showWrongOnly);
    fetchApiBtn.addEventListener("click", handleApiFetch);
  }

  initSelectors();
  bindEvents();
  apiKeyInput.value = localStorage.getItem("qnet-service-key") || "";
})();
