'use client';

import { useMemo, useState, useRef, useEffect } from 'react';

const METHODS = [
  { value: 'recasting', label: 'Recasting', detail: 'Reformula con la forma correcta, mismo significado.' },
  { value: 'explicit', label: 'Explicita', detail: 'Correccion directa y explicita.' },
  { value: 'no_correction', label: 'No corregir', detail: 'No corrige errores.' },
];

const QUESTION_METHODS = [
  { value: 'factoid', label: 'Factoides', detail: 'Preguntas factoides.' },
  { value: 'non_factoid', label: 'No factoides', detail: 'Preguntas no factoides.' },
];

const GROUNDED_OPTIONS = [
  { value: 'grounded', label: 'Grounded', detail: 'Responde anclado en el texto/historia.' },
  { value: 'no_grounded', label: 'No grounded', detail: 'No fuerza anclaje en el texto/historia.' },
];

const PROMPT_PLACEHOLDERS = {
  story: '[[STORY]]',
  feedback: (value) => `[[FEEDBACK:${value}]]`,
  question: (value) => `[[QUESTION:${value}]]`,
  grounded: (value) => `[[GROUNDED:${value}]]`,
};

const DEFAULT_TRIGGER = 'Ask a question to start interaction';
const MAX_PROMPT_DEFINITIONS = 6;

function normalizeBase(url) {
  if (!url) return '';
  return url.replace(/\/$/, '');
}

function createPromptDefinition(index) {
  return {
    id: `prompt_${index}`,
    name: `Prompt ${index}`,
    mode: 'base',
    feedbackMethod: 'recasting',
    questionMethod: 'factoid',
    grounded: 'grounded',
    template: '',
  };
}

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export default function Page() {
  const baseUrl = useMemo(() => normalizeBase(process.env.NEXT_PUBLIC_API_BASE || ''), []);

  const [method, setMethod] = useState('recasting');
  const [questionMethod, setQuestionMethod] = useState('factoid');
  const [grounded, setGrounded] = useState('grounded');
  const [story, setStory] = useState('');
  const [triggerMessage, setTriggerMessage] = useState(DEFAULT_TRIGGER);
  const [usePromptLab, setUsePromptLab] = useState(false);
  const [promptDefinitions, setPromptDefinitions] = useState([createPromptDefinition(1), createPromptDefinition(2)]);
  const [activePromptId, setActivePromptId] = useState('prompt_1');
  const [showPreview, setShowPreview] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  const [messages, setMessages] = useState([]);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [conversationId, setConversationId] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingTurn, setPendingTurn] = useState(null);
  const [pendingCandidates, setPendingCandidates] = useState([]);
  const [committingCandidateId, setCommittingCandidateId] = useState('');

  const messagesEndRef = useRef(null);
  const promptCounterRef = useRef(3);

  const activePrompt = promptDefinitions.find((definition) => definition.id === activePromptId) || promptDefinitions[0] || null;
  const selectionPending = !!pendingTurn && pendingCandidates.length > 0;
  const configuredPromptCount = promptDefinitions.filter((definition) => {
    if (definition.mode === 'base') return true;
    return definition.template.trim().length > 0;
  }).length;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingCandidates, committingCandidateId]);

  useEffect(() => {
    if (!promptDefinitions.length) return;
    if (!promptDefinitions.some((definition) => definition.id === activePromptId)) {
      setActivePromptId(promptDefinitions[0].id);
    }
  }, [promptDefinitions, activePromptId]);

  const resolvePromptTemplate = (template) => {
    let resolved = template || '';
    METHODS.forEach((item) => {
      resolved = resolved.split(PROMPT_PLACEHOLDERS.feedback(item.value)).join(`<${item.value.toUpperCase()}>`);
    });
    QUESTION_METHODS.forEach((item) => {
      resolved = resolved.split(PROMPT_PLACEHOLDERS.question(item.value)).join(`<${item.value.toUpperCase()}>`);
    });
    GROUNDED_OPTIONS.forEach((item) => {
      resolved = resolved.split(PROMPT_PLACEHOLDERS.grounded(item.value)).join(`<${item.value.toUpperCase()}>`);
    });
    if (story.trim()) {
      resolved = resolved.split(PROMPT_PLACEHOLDERS.story).join(story.trim());
    }
    return resolved;
  };

  const buildPromptDefinitionsPayload = () => {
    return promptDefinitions
      .map((definition) => {
        const common = {
          id: definition.id,
          name: definition.name.trim() || definition.id,
        };

        if (definition.mode === 'base') {
          const baseDefinition = {
            ...common,
            type: 'base',
            story,
          };
          if (definition.feedbackMethod) baseDefinition.correction_style = definition.feedbackMethod;
          if (definition.questionMethod) baseDefinition.question_type = definition.questionMethod;
          if (definition.grounded) baseDefinition.grounded = definition.grounded;
          return baseDefinition;
        }

        return {
          ...common,
          type: 'custom',
          prompt: resolvePromptTemplate(definition.template),
        };
      })
      .filter((definition) => definition.type === 'base' || definition.prompt.trim());
  };

  const buildChatPayload = ({ message = '', reset }) => {
    const payload = { reset };
    if (conversationId) payload.conversation_id = conversationId;

    if (reset) {
      return payload;
    }

    payload.message = message;

    if (usePromptLab) {
      const promptDefs = buildPromptDefinitionsPayload();
      if (!reset && promptDefs.length === 0) {
        throw new Error('PROMPT_DEFINITIONS_EMPTY');
      }
      if (promptDefs.length) {
        payload.prompt_definitions = promptDefs;
      }
      return payload;
    }

    const singleModePayload = {
      ...payload,
      story,
    };
    if (method) singleModePayload.correction_style = method;
    if (questionMethod) singleModePayload.question_type = questionMethod;
    if (grounded) singleModePayload.grounded = grounded;
    return singleModePayload;
  };

  const normalizeCandidate = (candidate, index) => {
    const candidateId = candidate?.candidate_id || candidate?.candidateId || candidate?.id || `candidate_${index + 1}`;
    const promptId = candidate?.prompt_id || candidate?.promptId || candidate?.prompt_definition_id || candidate?.promptDefinitionId || '';
    const promptName = candidate?.prompt_name || candidate?.promptName || '';
    const response =
      candidate?.response ||
      candidate?.text ||
      candidate?.message ||
      candidate?.content ||
      '';

    const promptFromList = promptDefinitions.find((definition) => definition.id === promptId);
    return {
      candidateId: String(candidateId),
      promptId: String(promptId || ''),
      promptLabel: promptName || promptFromList?.name || promptId || `Prompt ${index + 1}`,
      response: String(response || ''),
    };
  };

  const applyChatResponse = (data, { replaceMessages = false } = {}) => {
    const nextConversationId = data?.conversation_id || data?.conversationId || '';
    const nextTurnId = data?.turn_id || data?.turnId || '';
    const rawCandidates = Array.isArray(data?.candidates) ? data.candidates : [];
    const normalizedCandidates = rawCandidates
      .map((candidate, index) => normalizeCandidate(candidate, index))
      .filter((candidate) => candidate.response);

    if (nextConversationId) {
      setConversationId(nextConversationId);
    }

    if (normalizedCandidates.length) {
      setPendingTurn({
        turnId: nextTurnId,
        conversationId: nextConversationId || conversationId || '',
      });
      setPendingCandidates(normalizedCandidates);
      if (replaceMessages) {
        setMessages([]);
      }
      return { type: 'candidates' };
    }

    setPendingTurn(null);
    setPendingCandidates([]);

    const responseText =
      data?.response ||
      data?.assistant_response ||
      data?.assistantResponse ||
      data?.message ||
      '';

    if (responseText) {
      if (replaceMessages) {
        setMessages([{ role: 'assistant', content: responseText }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: responseText }]);
      }
      return { type: 'single', response: responseText };
    }

    return { type: 'empty' };
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    if (!baseUrl) {
      setError('Configure NEXT_PUBLIC_API_BASE to connect.');
      return;
    }

    if (selectionPending) {
      setError('Elegí una respuesta en comparación para continuar.');
      return;
    }

    setError('');
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');

    try {
      const payload = buildChatPayload({ message: trimmed, reset: false });
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Error ${response.status}`);

      const data = await response.json();
      const outcome = applyChatResponse(data);
      if (outcome.type === 'empty') {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'No response.' }]);
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'PROMPT_DEFINITIONS_EMPTY') {
        setError('Agrega al menos una definición de prompt con contenido.');
      } else {
        setError('Could not connect to backend.');
      }
    } finally {
      setLoading(false);
    }
  };

  const commitCandidate = async (candidate) => {
    if (!baseUrl || !pendingTurn || committingCandidateId) return;

    setError('');
    setCommittingCandidateId(candidate.candidateId);

    try {
      const payload = { candidate_id: candidate.candidateId };
      if (pendingTurn.turnId) payload.turn_id = pendingTurn.turnId;
      if (pendingTurn.conversationId || conversationId) {
        payload.conversation_id = pendingTurn.conversationId || conversationId;
      }

      const response = await fetch(`${baseUrl}/chat/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Error ${response.status}`);

      const data = await response.json();
      const nextConversationId = data?.conversation_id || data?.conversationId;
      if (nextConversationId) {
        setConversationId(nextConversationId);
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: candidate.response || 'No response.' }]);
      setPendingTurn(null);
      setPendingCandidates([]);
      setConversationStarted(true);
    } catch {
      setError('No se pudo guardar la respuesta seleccionada.');
    } finally {
      setCommittingCandidateId('');
    }
  };

  const resetConversation = async () => {
    setMessages([]);
    setConversationStarted(false);
    setError('');
    setPendingTurn(null);
    setPendingCandidates([]);
    setConversationId('');

    if (!baseUrl) return;

    try {
      const payload = buildChatPayload({ reset: true });
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) return;
      const data = await response.json();
      const nextConversationId = data?.conversation_id || data?.conversationId;
      if (nextConversationId) {
        setConversationId(nextConversationId);
      }
    } catch {}
  };

  const startConversation = async () => {
    if (loading || conversationStarted) return;

    if (!baseUrl) {
      setError('Configurá NEXT_PUBLIC_API_BASE para conectar.');
      return;
    }

    setError('');
    setLoading(true);
    setConversationStarted(true);
    setMessages([]);
    setPendingTurn(null);
    setPendingCandidates([]);

    try {
      const payload = buildChatPayload({ message: triggerMessage, reset: false });
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Error ${response.status}`);

      const data = await response.json();
      const outcome = applyChatResponse(data, { replaceMessages: true });
      if (outcome.type === 'empty') {
        setMessages([{ role: 'assistant', content: 'Sin respuesta.' }]);
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'PROMPT_DEFINITIONS_EMPTY') {
        setError('Agregá al menos una definición de prompt con contenido.');
      } else {
        setError('No se pudo conectar con el backend.');
      }
      setConversationStarted(false);
    } finally {
      setLoading(false);
    }
  };

  const updatePromptDefinition = (id, patch) => {
    setPromptDefinitions((prev) =>
      prev.map((definition) =>
        definition.id === id ? { ...definition, ...patch } : definition
      )
    );
  };

  const addPromptDefinition = () => {
    if (promptDefinitions.length >= MAX_PROMPT_DEFINITIONS) return;

    const nextIndex = promptCounterRef.current;
    promptCounterRef.current += 1;
    const nextDefinition = createPromptDefinition(nextIndex);
    setPromptDefinitions((prev) => [...prev, nextDefinition]);
    setActivePromptId(nextDefinition.id);
    setShowPreview(false);
  };

  const removePromptDefinition = (id) => {
    if (promptDefinitions.length === 1) return;

    const next = promptDefinitions.filter((definition) => definition.id !== id);
    setPromptDefinitions(next);
    if (activePromptId === id && next.length) {
      setActivePromptId(next[0].id);
    }
  };

  const insertToken = (value) => {
    if (!activePrompt || activePrompt.mode !== 'custom') return;

    const textarea = document.getElementById(`prompt-editor-${activePrompt.id}`);
    const currentTemplate = activePrompt.template || '';

    if (!textarea) {
      updatePromptDefinition(activePrompt.id, { template: currentTemplate + value });
      return;
    }

    const start = textarea.selectionStart ?? currentTemplate.length;
    const end = textarea.selectionEnd ?? currentTemplate.length;
    const next = currentTemplate.slice(0, start) + value + currentTemplate.slice(end);

    updatePromptDefinition(activePrompt.id, { template: next });

    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + value.length;
      textarea.setSelectionRange(pos, pos);
    });
  };

  const handleTokenDrop = (e) => {
    e.preventDefault();
    const value = e.dataTransfer.getData('text/plain');
    if (value) insertToken(value);
  };

  const copyPrompt = async () => {
    if (!activePrompt || activePrompt.mode !== 'custom') return;

    const resolved = resolvePromptTemplate(activePrompt.template);
    if (!resolved.trim()) return;

    try {
      await navigator.clipboard.writeText(resolved);
      setCopyStatus('Copiado');
      setTimeout(() => setCopyStatus(''), 2000);
    } catch {
      setCopyStatus('Fallo copiar');
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isConnected = !!baseUrl;
  const currentMethod = METHODS.find((item) => item.value === method);
  const currentQuestion = QUESTION_METHODS.find((item) => item.value === questionMethod);
  const currentGrounded = GROUNDED_OPTIONS.find((item) => item.value === grounded);
  const activePromptMethod = METHODS.find((item) => item.value === activePrompt?.feedbackMethod);
  const activePromptQuestion = QUESTION_METHODS.find((item) => item.value === activePrompt?.questionMethod);
  const activePromptGrounded = GROUNDED_OPTIONS.find((item) => item.value === activePrompt?.grounded);
  const activePromptIsCustom = activePrompt?.mode === 'custom';
  const composerPlaceholder = selectionPending
    ? 'Elegí una respuesta para continuar...'
    : 'Escribir un mensaje...';

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-text">Demo Concept Tokens</span>
          </div>
          <div className={`connection ${isConnected ? 'online' : ''}`}>
            <span className="connection-dot" />
            {isConnected ? 'Conectado' : 'Desconectado'}
          </div>
        </div>
        <div className="header-right">
          <button className="header-btn" onClick={resetConversation} title="Reset conversation">
            <RefreshIcon />
            <span>Reiniciar</span>
          </button>
          <button
            className={`header-btn ${drawerOpen ? 'active' : ''}`}
            onClick={() => setDrawerOpen(true)}
            title="Settings"
          >
            <SettingsIcon />
            <span>Configuración</span>
          </button>
        </div>
      </header>

      <div className="config-bar">
        {!usePromptLab && method && <span className="config-tag accent">{currentMethod?.label}</span>}
        {!usePromptLab && questionMethod && <span className="config-tag success">{currentQuestion?.label}</span>}
        {!usePromptLab && grounded && <span className="config-tag">{currentGrounded?.label}</span>}
        {story.trim() && <span className="config-tag warning">Historia</span>}
        {triggerMessage !== DEFAULT_TRIGGER && <span className="config-tag">Trigger personalizado</span>}
        {usePromptLab && <span className="config-tag">Prompt lab ({configuredPromptCount})</span>}
        {selectionPending && <span className="config-tag accent">Selección pendiente</span>}
      </div>

      <div className="chat-container">
        <div className="messages">
          {!conversationStarted && messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-content">
                <div className="empty-icon">💬</div>
                <h3>Iniciar conversación</h3>
                <p>El tutor comenzará haciéndote una pregunta</p>
                <button
                  className="start-btn"
                  onClick={startConversation}
                  disabled={loading}
                >
                  {loading ? 'Iniciando...' : 'Comenzar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="messages-inner">
              {messages.map((msg, index) => (
                <div key={index} className={`message ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === 'user' ? 'U' : 'CT'}
                  </div>
                  <div className="message-content">{msg.content}</div>
                </div>
              ))}

              {loading && !selectionPending && (
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

              {selectionPending && (
                <div className="candidate-panel">
                  <div className="candidate-panel-header">
                    <h4>Comparar respuestas</h4>
                    <p>Elegí la respuesta que queres guardar en el historial compartido.</p>
                  </div>
                  <div className="candidate-grid">
                    {pendingCandidates.map((candidate) => (
                      <article key={candidate.candidateId} className="candidate-card">
                        <div className="candidate-card-header">
                          <span className="candidate-tag">{candidate.promptLabel}</span>
                        </div>
                        <div className="candidate-content">{candidate.response}</div>
                        <button
                          className="candidate-select-btn"
                          onClick={() => commitCandidate(candidate)}
                          disabled={loading || !!committingCandidateId}
                        >
                          {committingCandidateId === candidate.candidateId ? 'Guardando...' : 'Elegir esta respuesta'}
                        </button>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="composer-wrapper">
          {error && <div className="error-toast">{error}</div>}
          {selectionPending && (
            <div className="pending-toast">Selección pendiente: elegí una respuesta para seguir.</div>
          )}
          <div className="composer">
            <div className="composer-input">
              <textarea
                placeholder={composerPlaceholder}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                disabled={loading || selectionPending}
              />
            </div>
            <button
              className="send-btn"
              onClick={sendMessage}
              disabled={loading || !input.trim() || selectionPending}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`drawer-overlay ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

      <aside className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h2 className="drawer-title">Configuración</h2>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)}>
            <CloseIcon />
          </button>
        </div>

        <div className="drawer-body">
          {usePromptLab ? null : (
            <>
              <div className="settings-section">
                <span className="settings-label">Correccion de errores</span>
                <div className="pill-group">
                  {METHODS.map((item) => (
                    <button
                      key={item.value}
                      className={`pill ${method === item.value ? 'selected' : ''}`}
                      onClick={() => setMethod((prev) => (prev === item.value ? '' : item.value))}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="pill-hint">{currentMethod?.detail || 'Sin restriccion de correccion.'}</div>
              </div>

              <div className="settings-section">
                <span className="settings-label">Tipo de pregunta</span>
                <div className="pill-group">
                  {QUESTION_METHODS.map((item) => (
                    <button
                      key={item.value}
                      className={`pill ${questionMethod === item.value ? 'selected' : ''}`}
                      onClick={() => setQuestionMethod((prev) => (prev === item.value ? '' : item.value))}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="pill-hint">{currentQuestion?.detail || 'Sin restriccion de tipo de pregunta.'}</div>
              </div>

              <div className="settings-section">
                <span className="settings-label">Grounded</span>
                <div className="pill-group">
                  {GROUNDED_OPTIONS.map((item) => (
                    <button
                      key={item.value}
                      className={`pill ${grounded === item.value ? 'selected' : ''}`}
                      onClick={() => setGrounded((prev) => (prev === item.value ? '' : item.value))}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="pill-hint">{currentGrounded?.detail || 'Sin restriccion de grounded.'}</div>
              </div>
            </>
          )}

          <div className="settings-section">
            <span className="settings-label">Historia</span>
            <button
              className={`story-toggle ${story.trim() ? 'has-content' : ''} ${storyOpen ? 'open' : ''}`}
              onClick={() => setStoryOpen(!storyOpen)}
            >
              <span>{story.trim() ? 'Historia configurada' : 'Agregar una historia (opcional)'}</span>
              <ChevronIcon />
            </button>
            <div className={`story-content ${storyOpen ? 'open' : ''}`}>
              <textarea
                placeholder="Pega una historia para guiar la conversacion..."
                value={story}
                onChange={(e) => setStory(e.target.value)}
                rows={5}
              />
            </div>
          </div>

          <div className="settings-section">
            <span className="settings-label">Mensaje inicial</span>
            <button
              className={`story-toggle ${triggerMessage !== DEFAULT_TRIGGER ? 'has-content' : ''} ${triggerOpen ? 'open' : ''}`}
              onClick={() => setTriggerOpen(!triggerOpen)}
            >
              <span>{triggerMessage !== DEFAULT_TRIGGER ? 'Trigger personalizado' : 'Personalizar mensaje inicial'}</span>
              <ChevronIcon />
            </button>
            <div className={`story-content ${triggerOpen ? 'open' : ''}`}>
              <p className="trigger-hint">
                Este mensaje se envía (oculto) al iniciar la conversación para que el tutor hable primero.
              </p>
              <textarea
                placeholder="Mensaje que inicia la conversación..."
                value={triggerMessage}
                onChange={(e) => setTriggerMessage(e.target.value)}
                rows={3}
              />
              <button
                className="reset-trigger-btn"
                onClick={() => setTriggerMessage(DEFAULT_TRIGGER)}
              >
                Restaurar default
              </button>
            </div>
          </div>

          <div className="settings-section">
            <div className="accordion">
              <button
                className={`accordion-trigger ${advancedOpen ? 'open' : ''}`}
                onClick={() => setAdvancedOpen(!advancedOpen)}
              >
                <span>Personalizar prompt</span>
                <ChevronIcon />
              </button>
              <div className={`accordion-body ${advancedOpen ? 'open' : ''}`}>
                <div className="prompt-mode-toggle">
                  <button
                    className={`mode-btn ${!usePromptLab ? 'active' : ''}`}
                    onClick={() => setUsePromptLab(false)}
                  >
                    Prompt base
                  </button>
                  <button
                    className={`mode-btn ${usePromptLab ? 'active' : ''}`}
                    onClick={() => setUsePromptLab(true)}
                  >
                    Prompt lab
                  </button>
                </div>

                {usePromptLab && (
                  <>
                    <div className="prompt-lab-header">
                      <span className="token-label">Prompt definitions</span>
                      <button
                        className="add-prompt-btn"
                        onClick={addPromptDefinition}
                        disabled={promptDefinitions.length >= MAX_PROMPT_DEFINITIONS}
                      >
                        Agregar
                      </button>
                    </div>

                    <div className="prompt-tabs">
                      {promptDefinitions.map((definition) => (
                        <div
                          key={definition.id}
                          className={`prompt-tab ${activePromptId === definition.id ? 'active' : ''}`}
                        >
                          <button
                            className="prompt-tab-select"
                            onClick={() => setActivePromptId(definition.id)}
                          >
                            {definition.name || definition.id}
                          </button>
                          <button
                            className="prompt-tab-remove"
                            onClick={() => removePromptDefinition(definition.id)}
                            disabled={promptDefinitions.length === 1}
                            title="Eliminar prompt"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>

                    <p className="prompt-lab-hint">
                      Cada envío ejecuta estas definiciones sobre el mismo historial y te permite comparar respuestas.
                    </p>

                    <div className="prompt-field">
                      <label className="token-label" htmlFor={`prompt-name-${activePrompt?.id || 'none'}`}>
                        Nombre del prompt activo
                      </label>
                      <input
                        id={`prompt-name-${activePrompt?.id || 'none'}`}
                        className="prompt-name-input"
                        value={activePrompt?.name || ''}
                        onChange={(e) => {
                          if (!activePrompt) return;
                          updatePromptDefinition(activePrompt.id, { name: e.target.value });
                        }}
                        placeholder="Nombre para identificar esta variante"
                      />
                    </div>

                    <div className="prompt-definition-mode">
                      <button
                        className={`mode-btn ${activePromptIsCustom ? '' : 'active'}`}
                        onClick={() => {
                          if (!activePrompt) return;
                          updatePromptDefinition(activePrompt.id, { mode: 'base' });
                        }}
                      >
                        Base tokens
                      </button>
                      <button
                        className={`mode-btn ${activePromptIsCustom ? 'active' : ''}`}
                        onClick={() => {
                          if (!activePrompt) return;
                          updatePromptDefinition(activePrompt.id, { mode: 'custom' });
                        }}
                      >
                        Custom text
                      </button>
                    </div>

                    {!activePromptIsCustom ? (
                      <div className="prompt-base-editor">
                        <div className="settings-section prompt-base-section">
                          <span className="settings-label">Correccion (prompt activo)</span>
                          <div className="pill-group">
                            {METHODS.map((item) => (
                              <button
                                key={item.value}
                                className={`pill ${activePrompt?.feedbackMethod === item.value ? 'selected' : ''}`}
                                onClick={() => {
                                  if (!activePrompt) return;
                                  updatePromptDefinition(activePrompt.id, {
                                    feedbackMethod: activePrompt.feedbackMethod === item.value ? '' : item.value,
                                  });
                                }}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                          <div className="pill-hint">{activePromptMethod?.detail || 'Sin restriccion de correccion.'}</div>
                        </div>

                        <div className="settings-section prompt-base-section">
                          <span className="settings-label">Tipo de pregunta (prompt activo)</span>
                          <div className="pill-group">
                            {QUESTION_METHODS.map((item) => (
                              <button
                                key={item.value}
                                className={`pill ${activePrompt?.questionMethod === item.value ? 'selected' : ''}`}
                                onClick={() => {
                                  if (!activePrompt) return;
                                  updatePromptDefinition(activePrompt.id, {
                                    questionMethod: activePrompt.questionMethod === item.value ? '' : item.value,
                                  });
                                }}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                          <div className="pill-hint">{activePromptQuestion?.detail || 'Sin restriccion de tipo de pregunta.'}</div>
                        </div>

                        <div className="settings-section prompt-base-section">
                          <span className="settings-label">Grounded (prompt activo)</span>
                          <div className="pill-group">
                            {GROUNDED_OPTIONS.map((item) => (
                              <button
                                key={item.value}
                                className={`pill ${activePrompt?.grounded === item.value ? 'selected' : ''}`}
                                onClick={() => {
                                  if (!activePrompt) return;
                                  updatePromptDefinition(activePrompt.id, {
                                    grounded: activePrompt.grounded === item.value ? '' : item.value,
                                  });
                                }}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                          <div className="pill-hint">{activePromptGrounded?.detail || 'Sin restriccion de grounded.'}</div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="token-section">
                          <div className="token-label">Tokens de correccion</div>
                          <div className="token-list">
                            {METHODS.map((item) => (
                              <button
                                key={item.value}
                                className="token feedback"
                                draggable
                                onDragStart={(e) =>
                                  e.dataTransfer.setData('text/plain', PROMPT_PLACEHOLDERS.feedback(item.value))
                                }
                                onClick={() => insertToken(PROMPT_PLACEHOLDERS.feedback(item.value))}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="token-section">
                          <div className="token-label">Tokens de tipo de pregunta</div>
                          <div className="token-list">
                            {QUESTION_METHODS.map((item) => (
                              <button
                                key={item.value}
                                className="token question"
                                draggable
                                onDragStart={(e) =>
                                  e.dataTransfer.setData('text/plain', PROMPT_PLACEHOLDERS.question(item.value))
                                }
                                onClick={() => insertToken(PROMPT_PLACEHOLDERS.question(item.value))}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="token-section">
                          <div className="token-label">Tokens de grounded</div>
                          <div className="token-list">
                            {GROUNDED_OPTIONS.map((item) => (
                              <button
                                key={item.value}
                                className="token grounded"
                                draggable
                                onDragStart={(e) =>
                                  e.dataTransfer.setData('text/plain', PROMPT_PLACEHOLDERS.grounded(item.value))
                                }
                                onClick={() => insertToken(PROMPT_PLACEHOLDERS.grounded(item.value))}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="token-section">
                          <div className="token-label">Contenido</div>
                          <div className="token-list">
                            <button
                              className="token story"
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData('text/plain', PROMPT_PLACEHOLDERS.story)}
                              onClick={() => insertToken(PROMPT_PLACEHOLDERS.story)}
                            >
                              Story
                            </button>
                          </div>
                        </div>

                        {showPreview ? (
                          <div className="prompt-preview">
                            <div className="prompt-preview-header">
                              <span className="prompt-preview-label">Preview</span>
                              <button className="copy-btn" onClick={copyPrompt}>
                                {copyStatus || 'Copiar'}
                              </button>
                            </div>
                            <pre>
                              {activePrompt
                                ? resolvePromptTemplate(activePrompt.template) || 'Escribir prompt para ver preview'
                                : 'Seleccionar prompt'}
                            </pre>
                          </div>
                        ) : (
                          <textarea
                            id={`prompt-editor-${activePrompt?.id || 'none'}`}
                            className="prompt-textarea"
                            placeholder="Escribir prompt. Arrastrar o hacer click en los tokens para insertarlos."
                            value={activePrompt?.template || ''}
                            onChange={(e) => {
                              if (!activePrompt) return;
                              updatePromptDefinition(activePrompt.id, { template: e.target.value });
                            }}
                            onDrop={handleTokenDrop}
                            onDragOver={(e) => e.preventDefault()}
                            rows={6}
                          />
                        )}

                        <button
                          className="mode-btn prompt-toggle-preview"
                          onClick={() => setShowPreview(!showPreview)}
                        >
                          {showPreview ? 'Editar prompt' : 'Vista previa'}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
