import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_PROMPTS_ADMIN = [
  'Algo para la gripe',
  'Medicamento para fiebre',
  'Productos por vencer',
  'Antiinflamatorios disponibles',
  'Algo para la tos',
  'Alertas de inventario',
];

const QUICK_PROMPTS_EMPLEADO = [
  'Algo para la gripe',
  'Medicamento para fiebre',
  'Algo para el dolor',
  'Algo para la tos',
  'Antiinflamatorios disponibles',
  'Vitaminas disponibles',
];

const QUICK_PROMPTS_CLIENTE = [
  'Algo para la gripe',
  'Medicamento para fiebre',
  'Algo para el dolor',
  'Algo para la tos',
];

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: 'Administrador', color: 'bg-amber-100 text-amber-700' },
  empleado: { label: 'Empleado', color: 'bg-sky-100 text-sky-700' },
  cliente: { label: 'Cliente', color: 'bg-slate-100 text-slate-600' },
};

function formatMessage(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

export default function PharmacyChat() {
  const { currentBranch, currentUser } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'Hola! Soy el asistente de farmacia Genosan. Puedo ayudarte a encontrar medicamentos disponibles en el inventario. ¿En qué te puedo ayudar?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine role — map 'admin'/'cashier'/'manager' to system roles
  const rawRole = currentUser?.role ?? 'cliente';
  const userRole = rawRole === 'admin' ? 'admin' : rawRole === 'cashier' || rawRole === 'manager' || rawRole === 'supervisor' ? 'empleado' : 'cliente';

  const roleInfo = ROLE_LABELS[userRole] ?? ROLE_LABELS.cliente;

  const quickPrompts =
    userRole === 'admin'
      ? QUICK_PROMPTS_ADMIN
      : userRole === 'empleado'
      ? QUICK_PROMPTS_EMPLEADO
      : QUICK_PROMPTS_CLIENTE;

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, isOpen]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('pharmacy-ai-chat', {
        body: {
          message: trimmed,
          branchId: currentBranch?.id || null,
          userRole,
        },
      });

      if (error) throw error;

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data?.reply || 'No se pudo obtener respuesta.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Hubo un error al conectar con el asistente. Por favor intenta de nuevo.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-emerald-700 hover:bg-emerald-600 text-white flex items-center justify-center cursor-pointer transition-all whitespace-nowrap"
        title="Asistente de Farmacia IA"
        style={{ boxShadow: '0 4px 20px rgba(5,150,105,0.4)' }}
      >
        {isOpen ? (
          <i className="ri-close-line text-2xl"></i>
        ) : (
          <i className="ri-medicine-bottle-line text-2xl"></i>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div
          className="fixed bottom-24 right-6 z-50 w-[380px] rounded-2xl overflow-hidden flex flex-col"
          style={{
            height: '540px',
            background: '#fff',
            border: '1px solid #e2e8f0',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-700 text-white flex-shrink-0">
            <div className="w-9 h-9 flex items-center justify-center bg-white/20 rounded-full">
              <i className="ri-medicine-bottle-line text-lg"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">Asistente Farmacia</p>
              <p className="text-emerald-200 text-xs">
                {currentBranch ? currentBranch.name : 'Genosan'} · Inventario en tiempo real
              </p>
            </div>
            {/* Role badge */}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${roleInfo.color}`}>
              {roleInfo.label}
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white cursor-pointer transition-colors ml-1"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 flex items-center justify-center bg-emerald-100 rounded-full mr-2 flex-shrink-0 mt-0.5">
                    <i className="ri-medicine-bottle-line text-emerald-700 text-sm"></i>
                  </div>
                )}
                <div
                  className={`max-w-[85%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-sm'
                      : 'bg-white text-slate-700 rounded-bl-sm border border-slate-200'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <span dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 flex items-center justify-center bg-emerald-100 rounded-full mr-2 flex-shrink-0 mt-0.5">
                  <i className="ri-medicine-bottle-line text-emerald-700 text-sm"></i>
                </div>
                <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 1 && (
            <div className="px-3 py-2 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto flex-shrink-0">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer transition-colors whitespace-nowrap"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-3 bg-white border-t border-slate-200 flex-shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ej: algo para la gripe..."
              disabled={isLoading}
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="w-9 h-9 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white rounded-xl cursor-pointer transition-colors flex-shrink-0"
            >
              <i className="ri-send-plane-fill text-sm"></i>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
