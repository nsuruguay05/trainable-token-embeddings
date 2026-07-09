'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const CORRECTION_OPTIONS = [
  { value: 'recasting', label: 'Recasting', detail: 'Reformula con la forma correcta de manera implícita.' },
  { value: 'explicit', label: 'Explicita', detail: 'Corrige de forma directa.' },
  { value: 'no_correction', label: 'Sin correccion', detail: 'No corrige errores.' },
];

const QUESTION_TYPE_OPTIONS = [
  { value: 'factoid', label: 'Factoides', detail: 'Preguntas factoides.' },
  { value: 'non_factoid', label: 'No factoides', detail: 'Preguntas no factoides.' },
];

const GROUNDED_OPTIONS = [
  { value: 'grounded', label: 'Grounded', detail: 'La respuesta se obtiene de la historia.' },
  { value: 'no_grounded', label: 'No grounded', detail: 'La respuesta no se obtiene de la historia.' },
];

const DEFAULT_TRIGGER = 'Ask a question to start interaction';
const DEFAULT_MAX_INTERACTIONS = 5;

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

function normalizeBase(url) {
  if (!url) return '';
  return url.replace(/\/$/, '');
}

function normalizeMaxInteractions(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_INTERACTIONS;
  }
  return parsed;
}

function isEnabledFlag(value, fallback = true) {
  if (value === undefined) return fallback;
  return String(value).trim().toLowerCase() !== 'false';
}

function pickValue(sources, keys) {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      if (!(key in source)) continue;
      const value = source[key];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
  }
  return '';
}

function normalizeCorrectionStyle(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'recasting') return 'recasting';
  if (normalized === 'explicit' || normalized === 'explicit_correction') return 'explicit';
  if (normalized === 'no_correction' || normalized === 'none') return 'no_correction';
  return '';
}

function normalizeQuestionType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'factoid') return 'factoid';
  if (normalized === 'non_factoid' || normalized === 'non-factoid' || normalized === 'nonfactoid') {
    return 'non_factoid';
  }
  return '';
}

function normalizeGrounded(value) {
  if (value === true) return 'grounded';
  if (value === false) return 'no_grounded';

  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'grounded' || normalized === 'true') return 'grounded';
  if (normalized === 'no_grounded' || normalized === 'not_grounded' || normalized === 'false') {
    return 'no_grounded';
  }
  return '';
}

function normalizeAssignment(data, userId) {
  const payload = data || {};
  const config = payload.configuration || payload.config || payload.assignment || payload;

  const assignmentId =
    String(
      pickValue([payload, config], ['assignment_id', 'assignmentId']) ||
        pickValue([payload], ['id']) ||
        pickValue([config], ['id']) ||
        ''
    ) || '';

  const configurationId = String(
    pickValue([payload, config], ['configuration_id', 'configurationId', 'config_id', 'configId']) || ''
  );

  return {
    assignmentId: assignmentId || configurationId,
    configurationId,
    userId: String(pickValue([payload, config], ['user_id', 'userId']) || userId),
    story: String(pickValue([config], ['story']) || ''),
    triggerMessage: String(
      pickValue([config], ['trigger_message', 'triggerMessage', 'initial_message', 'initialMessage']) ||
        DEFAULT_TRIGGER
    ),
    correctionStyle: normalizeCorrectionStyle(
      pickValue([config], ['correction_style', 'correctionStyle'])
    ),
    questionType: normalizeQuestionType(
      pickValue([config], ['question_type', 'questionType'])
    ),
    grounded: normalizeGrounded(
      pickValue([config], ['grounded', 'is_grounded', 'isGrounded'])
    ),
  };
}

function buildChatPayload({ assignment, conversationId, message = '', reset = false }) {
  const payload = { reset };

  if (conversationId) {
    payload.conversation_id = conversationId;
  }

  payload.message = message;

  if (assignment.story) payload.story = assignment.story;
  if (assignment.correctionStyle) payload.correction_style = assignment.correctionStyle;
  if (assignment.questionType) payload.question_type = assignment.questionType;
  if (assignment.grounded) payload.grounded = assignment.grounded;

  return payload;
}

function extractAssistantResponse(data) {
  const directResponse =
    data?.response ||
    data?.assistant_response ||
    data?.assistantResponse ||
    data?.message ||
    '';

  if (directResponse) {
    return String(directResponse);
  }

  if (Array.isArray(data?.candidates) && data.candidates.length > 0) {
    const firstCandidate = data.candidates[0];
    return String(
      firstCandidate?.response ||
        firstCandidate?.text ||
        firstCandidate?.message ||
        firstCandidate?.content ||
        ''
    );
  }

  return '';
}

function createEvaluationQuestions(assignment) {
  const questions = [];

  if (assignment?.correctionStyle) {
    questions.push({
      id: 'correction_style',
      title: 'Corrección',
      prompt: '¿Cómo corrigió el tutor en general?',
      options: CORRECTION_OPTIONS,
    });
  }

  if (assignment?.questionType) {
    questions.push({
      id: 'question_type',
      title: 'Tipo de pregunta',
      prompt: '¿Las preguntas fueron más bien factoides o no factoides?',
      options: QUESTION_TYPE_OPTIONS,
    });
  }

  if (assignment?.grounded) {
    questions.push({
      id: 'grounded',
      title: 'Grounded',
      prompt: '¿La conversación estuvo anclada en la historia?',
      options: GROUNDED_OPTIONS,
    });
  }

  return questions;
}

function createSubmissionPayload({
  assignment,
  sessionUserId,
  conversationId,
  messages,
  interactionCount,
  maxInteractions,
  surveyAnswers,
  comments,
}) {
  const payload = {
    assignment_id: assignment.assignmentId,
    user_id: sessionUserId,
    conversation_id: conversationId || '',
    conversation_history: messages.map((message, index) => ({
      index,
      role: message.role,
      content: message.content,
    })),
    completed_interactions: interactionCount,
    max_interactions: maxInteractions,
    evaluations: {
      correction_style: surveyAnswers.correction_style || null,
      question_type: surveyAnswers.question_type || null,
      grounded: surveyAnswers.grounded || null,
    },
    comments: comments.trim() || '',
  };

  if (assignment.configurationId) {
    payload.configuration_id = assignment.configurationId;
  }

  return payload;
}

export default function Page() {
  const configuredChatBaseUrl = useMemo(
    () => normalizeBase(process.env.NEXT_PUBLIC_CHAT_API_BASE || process.env.NEXT_PUBLIC_API_BASE || ''),
    []
  );
  const hasConfiguredChatProxyTarget = useMemo(
    () => isEnabledFlag(process.env.NEXT_PUBLIC_HAS_CHAT_API_BASE, Boolean(configuredChatBaseUrl)),
    [configuredChatBaseUrl]
  );
  const maxInteractions = useMemo(
    () => normalizeMaxInteractions(process.env.NEXT_PUBLIC_MAX_INTERACTIONS),
    []
  );
  const useEvaluationMocks = useMemo(
    () => isEnabledFlag(process.env.NEXT_PUBLIC_USE_EVAL_MOCKS, true),
    []
  );
  const requiresChatUrlInput = !hasConfiguredChatProxyTarget;

  const [stage, setStage] = useState('intro');
  const [userIdInput, setUserIdInput] = useState('');
  const [chatUrlInput, setChatUrlInput] = useState(configuredChatBaseUrl);
  const [sessionUserId, setSessionUserId] = useState('');
  const [sessionChatBaseUrl, setSessionChatBaseUrl] = useState(configuredChatBaseUrl);
  const [assignment, setAssignment] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState('');
  const [interactionCount, setInteractionCount] = useState(0);
  const [input, setInput] = useState('');
  const [surveyAnswers, setSurveyAnswers] = useState({});
  const [comments, setComments] = useState('');
  const [surveyStepIndex, setSurveyStepIndex] = useState(0);
  const [surveyMinimized, setSurveyMinimized] = useState(false);
  const [error, setError] = useState('');
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [submissionLoading, setSubmissionLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const surveyQuestions = useMemo(() => createEvaluationQuestions(assignment), [assignment]);
  const surveySteps = useMemo(
    () => [...surveyQuestions.map((question) => ({ type: 'question', question })), { type: 'comments' }],
    [surveyQuestions]
  );
  const currentSurveyStep = surveySteps[surveyStepIndex] || surveySteps[surveySteps.length - 1] || null;
  const interactionsRemaining = Math.max(maxInteractions - interactionCount, 0);
  const canSend = stage === 'chat' && !chatLoading && interactionsRemaining > 0;
  const activeChatBaseUrl = sessionChatBaseUrl || configuredChatBaseUrl;
  const previewChatBaseUrl = activeChatBaseUrl || normalizeBase(chatUrlInput);
  const chatProxyUrl = '/api/chat';
  const evaluationSessionUrl = '/api/evaluation/session';
  const evaluationSubmitUrl = '/api/evaluation';
  const showSurveyModal = (stage === 'survey' && !surveyMinimized) || stage === 'complete';
  const showSurveyDock = stage === 'survey' && surveyMinimized;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  useEffect(() => {
    if (surveyStepIndex >= surveySteps.length) {
      setSurveyStepIndex(Math.max(surveySteps.length - 1, 0));
    }
  }, [surveyStepIndex, surveySteps.length]);

  const resolveChatBaseUrl = () => configuredChatBaseUrl || normalizeBase(chatUrlInput);

  const startConversation = async (assigned, chatBaseUrl) => {
    if (!chatBaseUrl && requiresChatUrlInput) {
      setError('Ingresá la URL del backend de chat.');
      return false;
    }

    setChatLoading(true);
    setError('');
    setMessages([]);
    setConversationId('');
    setInteractionCount(0);
    setInput('');
    setSurveyAnswers({});
    setComments('');
    setSurveyStepIndex(0);
    setSurveyMinimized(false);

    try {
      const payload = buildChatPayload({
        assignment: assigned,
        conversationId: '',
        message: assigned.triggerMessage || DEFAULT_TRIGGER,
        reset: true,
      });

      const response = await fetch(chatProxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          chat_api_base: chatBaseUrl || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`CHAT_START_${response.status}`);
      }

      const data = await response.json();
      const nextConversationId = data?.conversation_id || data?.conversationId || '';
      const responseText = extractAssistantResponse(data) || 'Sin respuesta.';

      if (nextConversationId) {
        setConversationId(String(nextConversationId));
      }

      setMessages([{ role: 'assistant', content: responseText }]);
      return true;
    } catch {
      setError('No se pudo iniciar la conversación.');
      return false;
    } finally {
      setChatLoading(false);
    }
  };

  const requestAssignment = async (requestedUserId) => {
    const trimmedUserId = requestedUserId.trim();
    const selectedChatBaseUrl = resolveChatBaseUrl();

    if (!trimmedUserId) {
      setError('Ingresá un id.');
      return;
    }

    if (!selectedChatBaseUrl && requiresChatUrlInput) {
      setError('Ingresá la URL del backend de chat.');
      return;
    }

    setAssignmentLoading(true);
    setError('');

    try {
      const response = await fetch(evaluationSessionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: trimmedUserId }),
      });

      if (!response.ok) {
        throw new Error(`ASSIGNMENT_${response.status}`);
      }

      const data = await response.json();
      const normalizedAssignment = normalizeAssignment(data, trimmedUserId);

      if (!normalizedAssignment.assignmentId) {
        throw new Error('ASSIGNMENT_ID_MISSING');
      }

      setUserIdInput(trimmedUserId);
      setSessionUserId(trimmedUserId);
      setSessionChatBaseUrl(selectedChatBaseUrl);
      setAssignment(normalizedAssignment);
      setStage('chat');

      await startConversation(normalizedAssignment, selectedChatBaseUrl);
    } catch {
      setAssignment(null);
      setSessionUserId('');
      setSessionChatBaseUrl(configuredChatBaseUrl);
      setMessages([]);
      setConversationId('');
      setInteractionCount(0);
      setSurveyAnswers({});
      setComments('');
      setError('No se pudo cargar la sesión.');
      setStage('intro');
    } finally {
      setAssignmentLoading(false);
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();

    if (!trimmed || !assignment || !canSend) return;

    if (!activeChatBaseUrl && requiresChatUrlInput) {
      setError('Ingresá la URL del backend de chat.');
      return;
    }

    const userMessage = { role: 'user', content: trimmed };

    setChatLoading(true);
    setError('');
    setInput('');
    setMessages((prev) => [...prev, userMessage]);

    try {
      const payload = buildChatPayload({
        assignment,
        conversationId,
        message: trimmed,
        reset: false,
      });

      const response = await fetch(chatProxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          chat_api_base: activeChatBaseUrl || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`CHAT_${response.status}`);
      }

      const data = await response.json();
      const nextConversationId = data?.conversation_id || data?.conversationId || '';
      const responseText = extractAssistantResponse(data) || 'Sin respuesta.';
      const nextInteractionCount = interactionCount + 1;

      if (nextConversationId) {
        setConversationId(String(nextConversationId));
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: responseText }]);
      setInteractionCount(nextInteractionCount);

      if (nextInteractionCount >= maxInteractions) {
        setSurveyStepIndex(0);
        setSurveyMinimized(false);
        setStage('survey');
      }
    } catch {
      setMessages((prev) => {
        if (prev[prev.length - 1] === userMessage) {
          return prev.slice(0, -1);
        }
        return prev;
      });
      setInput(trimmed);
      setError('No se pudo enviar el mensaje.');
    } finally {
      setChatLoading(false);
    }
  };

  const submitEvaluation = async () => {
    if (!assignment || !sessionUserId) return;

    const missingAnswer = surveyQuestions.some((question) => !surveyAnswers[question.id]);
    if (missingAnswer) {
      setError('Falta responder.');
      return;
    }

    setSubmissionLoading(true);
    setError('');

    try {
      const payload = createSubmissionPayload({
        assignment,
        sessionUserId,
        conversationId,
        messages,
        interactionCount,
        maxInteractions,
        surveyAnswers,
        comments,
      });

      const response = await fetch(evaluationSubmitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`SUBMIT_${response.status}`);
      }

      setSurveyMinimized(false);
      setStage('complete');
    } catch {
      setError('No se pudo guardar la evaluación.');
    } finally {
      setSubmissionLoading(false);
    }
  };

  const resetToIntro = () => {
    setStage('intro');
    setAssignment(null);
    setSessionUserId('');
    setSessionChatBaseUrl(configuredChatBaseUrl);
    setMessages([]);
    setConversationId('');
    setInteractionCount(0);
    setInput('');
    setSurveyAnswers({});
    setComments('');
    setSurveyStepIndex(0);
    setSurveyMinimized(false);
    setError('');
  };

  const retryWithSameUser = async () => {
    if (!sessionUserId) return;
    await requestAssignment(sessionUserId);
  };

  const onComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const goToNextSurveyStep = () => {
    if (!currentSurveyStep) return;

    if (currentSurveyStep.type === 'question') {
      const currentAnswer = surveyAnswers[currentSurveyStep.question.id];
      if (!currentAnswer) {
        setError('Elegí una opción.');
        return;
      }
      setError('');
    }

    if (surveyStepIndex >= surveySteps.length - 1) {
      void submitEvaluation();
      return;
    }

    setSurveyStepIndex((prev) => prev + 1);
  };

  const goToPreviousSurveyStep = () => {
    setError('');
    setSurveyStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const renderEmptyState = () => {
    if (stage === 'intro') {
      return (
        <div className="empty-state">
          <div className="empty-content">
            <h3>Ingresar usuario</h3>
            <div className="start-form">
              <input
                className="start-input"
                value={userIdInput}
                onChange={(event) => setUserIdInput(event.target.value)}
                placeholder="usuario_001"
                disabled={assignmentLoading}
              />
              {requiresChatUrlInput && (
                <>
                  <p className="start-helper">Backend del chat</p>
                  <input
                    className="start-input"
                    value={chatUrlInput}
                    onChange={(event) => setChatUrlInput(event.target.value)}
                    placeholder="http://localhost:8000"
                    disabled={assignmentLoading}
                    inputMode="url"
                  />
                </>
              )}
              <button
                className="start-btn"
                onClick={() => requestAssignment(userIdInput)}
                disabled={assignmentLoading}
              >
                {assignmentLoading ? 'Cargando...' : 'Comenzar'}
              </button>
            </div>
            {error && <div className="error-toast intro-error">{error}</div>}
          </div>
        </div>
      );
    }

    return (
      <div className="empty-state">
        <div className="empty-content">
          <h3>{chatLoading ? 'Iniciando...' : 'Sin mensajes'}</h3>
          {!chatLoading && assignment && (
            <button className="start-btn" onClick={() => startConversation(assignment, activeChatBaseUrl)}>
              Reintentar
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderChatPanel = () => (
    <div className="chat-container">
      <div className="messages">
        {messages.length === 0 ? (
          renderEmptyState()
        ) : (
          <div className="messages-inner">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                <div className="message-avatar">{message.role === 'user' ? 'U' : 'CT'}</div>
                <div className="message-content">{message.content}</div>
              </div>
            ))}

            {chatLoading && (
              <div className="message assistant loading-message" aria-live="polite" aria-label="Generando respuesta">
                <div className="message-avatar">CT</div>
                <div className="message-content loading-bubble">
                  <span className="typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="composer-wrapper">
        {stage === 'chat' && error && <div className="error-toast">{error}</div>}
        {stage === 'chat' ? (
          <div className="composer">
            <div className="composer-input">
              <textarea
                placeholder={interactionsRemaining > 0 ? 'Escribir un mensaje...' : 'Sin interacciones.'}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onComposerKeyDown}
                rows={1}
                disabled={!canSend}
              />
            </div>
            <button
              className="send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || !canSend}
            >
              <SendIcon />
            </button>
          </div>
        ) : stage !== 'intro' ? (
          <div className="pending-toast">
            {stage === 'survey'
              ? surveyMinimized
                ? 'Cuestionario pausado.'
                : 'Cuestionario pendiente.'
              : 'Evaluación enviada.'}
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderSurveyModal = () => {
    if (stage === 'complete') {
      return (
        <div className="modal-overlay open">
          <div className="survey-modal completion-modal" role="dialog" aria-modal="true">
            <div className="survey-modal-header">
              <span className="survey-step-label">Listo</span>
              <h3>Evaluación enviada</h3>
            </div>
            <div className="survey-modal-body">
              <p className="survey-text">Gracias.</p>
            </div>
            <div className="survey-actions">
              <button className="header-btn" onClick={resetToIntro}>
                Cambiar usuario
              </button>
              <button className="start-btn modal-primary" onClick={retryWithSameUser} disabled={assignmentLoading}>
                {assignmentLoading ? 'Cargando...' : 'Otra ronda'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="modal-overlay open">
        <div className="survey-modal" role="dialog" aria-modal="true">
          <div className="survey-modal-header">
            <div className="survey-modal-heading">
              <span className="survey-step-label">
                Paso {surveyStepIndex + 1} de {surveySteps.length}
              </span>
              <h3>{currentSurveyStep?.type === 'question' ? currentSurveyStep.question.title : 'Comentarios'}</h3>
            </div>
            <button
              className="modal-link-btn"
              onClick={() => {
                setError('');
                setSurveyMinimized(true);
              }}
              disabled={submissionLoading}
            >
              Revisar chat
            </button>
          </div>

          <div className="survey-modal-body">
            {error && <div className="error-toast modal-error">{error}</div>}

            {currentSurveyStep?.type === 'question' ? (
              <div className="survey-step">
                <p className="survey-text">{currentSurveyStep.question.prompt}</p>
                <div className="survey-options">
                  {currentSurveyStep.question.options.map((option) => {
                    const checked = surveyAnswers[currentSurveyStep.question.id] === option.value;
                    return (
                      <button
                        key={option.value}
                        className={`survey-option ${checked ? 'selected' : ''}`}
                        onClick={() => {
                          setError('');
                          setSurveyAnswers((prev) => ({
                            ...prev,
                            [currentSurveyStep.question.id]: option.value,
                          }));
                        }}
                      >
                        <span className="survey-option-label">{option.label}</span>
                        <span className="survey-option-detail">{option.detail}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="survey-step">
                <textarea
                  className="modal-textarea"
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                  placeholder="Comentarios..."
                  rows={5}
                />
              </div>
            )}
          </div>

          <div className="survey-actions">
            <button className="header-btn" onClick={goToPreviousSurveyStep} disabled={surveyStepIndex === 0 || submissionLoading}>
              Atrás
            </button>
            <button className="start-btn modal-primary" onClick={goToNextSurveyStep} disabled={submissionLoading}>
              {currentSurveyStep?.type === 'comments'
                ? submissionLoading
                  ? 'Enviando...'
                  : 'Enviar'
                : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-text">Evaluación Concept Tokens</span>
          </div>
          {/* <div className={`connection ${previewChatBaseUrl ? 'online' : ''}`}>
            <span className="connection-dot" />
            {previewChatBaseUrl ? 'Conectado' : 'Desconectado'}
          </div> */}
        </div>
        <div className="header-right">
          {stage !== 'intro' && (
            <button className="header-btn" onClick={resetToIntro} title="Cambiar usuario">
              <RefreshIcon />
              <span>Cambiar usuario</span>
            </button>
          )}
        </div>
      </header>

      <div className="config-bar">
        {sessionUserId && <span className="config-tag">Usuario {sessionUserId}</span>}
        {stage !== 'intro' && <span className="config-tag accent">Restan {interactionsRemaining}</span>}
        {useEvaluationMocks && <span className="config-tag">Mock eval</span>}
      </div>

      {stage === 'intro' ? (
        renderChatPanel()
      ) : (
        <div className="workspace">
          <div className="chat-column">{renderChatPanel()}</div>
          {assignment?.story ? (
            <aside className="story-sidebar">
              <div className="story-card">
                <div className="story-card-header">Historia</div>
                <div className="story-card-content">{assignment.story}</div>
              </div>
            </aside>
          ) : null}
        </div>
      )}

      {showSurveyDock && (
        <button
          className="survey-dock"
          onClick={() => {
            setError('');
            setSurveyMinimized(false);
          }}
        >
          <span className="survey-dock-label">
            Paso {surveyStepIndex + 1} de {surveySteps.length}
          </span>
          <span className="survey-dock-title">
            {currentSurveyStep?.type === 'question'
              ? currentSurveyStep.question.title
              : 'Terminar cuestionario'}
          </span>
          <span className="survey-dock-action">Seguir cuestionario</span>
        </button>
      )}

      {showSurveyModal && renderSurveyModal()}
    </div>
  );
}
