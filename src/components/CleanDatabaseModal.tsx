import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sparkles, 
  X, 
  Check, 
  ArrowRight, 
  GitMerge, 
  Edit3, 
  ShoppingBag, 
  AlertCircle, 
  RotateCw,
  CheckCircle2,
  Info,
  ArrowLeftRight,
  Trash2,
  Undo2,
  ThumbsUp,
  ThumbsDown,
  Layers,
  ArrowLeft,
  ChevronRight
} from 'lucide-react';
import { GroceryItem, DatabaseCleanAction } from '../types';
import { cleanGroceryDatabaseApi } from '../services/geminiService';

interface CleanDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  groceryItems: GroceryItem[];
  onApplyChanges: (actions: DatabaseCleanAction[]) => Promise<void>;
  showToast: (msg: string) => void;
  onNavigateTab?: (tab: 'cookbook' | 'planning' | 'this_week' | 'shop' | 'batch' | 'settings') => void;
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

export function CleanDatabaseModal({
  isOpen,
  onClose,
  groceryItems,
  onApplyChanges,
  showToast,
  onNavigateTab
}: CleanDatabaseModalProps) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<DatabaseCleanAction[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [decisions, setDecisions] = useState<Record<number, 'accept' | 'reject'>>({});
  const [isApplying, setIsApplying] = useState<boolean>(false);

  // Swipe animation states
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [flyDirection, setFlyDirection] = useState<'left' | 'right' | null>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Map of items by ID for quick lookups
  const itemsMap = useMemo(() => {
    const map = new Map<string, GroceryItem>();
    for (const item of groceryItems) {
      map.set(item.id, item);
    }
    return map;
  }, [groceryItems]);

  // Unique available supermarket aisles
  const availableAisles = useMemo(() => {
    const standardAisles = [
      'Produce',
      'Meat',
      'Fish',
      'Dairy',
      'Bakery',
      'Pantry',
      'Canned',
      'Pasta',
      'Frozen',
      'Household'
    ];
    const customCats = new Set<string>(standardAisles);
    for (const item of groceryItems) {
      if (item.category && item.category.trim()) {
        customCats.add(item.category.trim());
      }
    }
    return Array.from(customCats).sort();
  }, [groceryItems]);

  const fetchRecommendations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const actions = await cleanGroceryDatabaseApi(groceryItems);
      setActions(actions);
      setCurrentIndex(0);
      setDecisions({});
    } catch (err: any) {
      console.error('Database clean error:', err);
      setError(err?.message || 'Failed to scan grocery database. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRecommendations();
    } else {
      setActions([]);
      setCurrentIndex(0);
      setDecisions({});
      setError(null);
      setIsApplying(false);
      setFlyDirection(null);
      setDragOffset({ x: 0, y: 0 });
    }
  }, [isOpen]);

  const updateCurrentAction = (updates: Partial<DatabaseCleanAction>) => {
    setActions(prev => {
      const next = [...prev];
      if (next[currentIndex]) {
        next[currentIndex] = { ...next[currentIndex], ...updates };
      }
      return next;
    });
  };

  const swapMergeDirection = () => {
    const action = actions[currentIndex];
    if (!action || action.actionType !== 'merge' || !action.secondaryItemId) return;
    
    const newPrimaryId = action.secondaryItemId;
    const newSecondaryId = action.primaryItemId;
    const itemA = itemsMap.get(newPrimaryId);
    const itemB = itemsMap.get(newSecondaryId);
    const nameA = itemA?.name || newPrimaryId;
    const nameB = itemB?.name || newSecondaryId;

    updateCurrentAction({
      primaryItemId: newPrimaryId,
      secondaryItemId: newSecondaryId,
      reason: `Absorb duplicate "${nameB}" into "${nameA}" (direction chosen by user).`
    });
  };

  const handleDecision = (decision: 'accept' | 'reject') => {
    if (flyDirection) return; // already animating

    setFlyDirection(decision === 'accept' ? 'right' : 'left');
    setDecisions(prev => ({ ...prev, [currentIndex]: decision }));

    setTimeout(() => {
      setFlyDirection(null);
      setDragOffset({ x: 0, y: 0 });
      setCurrentIndex(prev => prev + 1);
    }, 280);
  };

  const handleUndo = () => {
    if (currentIndex <= 0 || flyDirection) return;
    const prevIdx = currentIndex - 1;
    setCurrentIndex(prevIdx);
    setDecisions(prev => {
      const next = { ...prev };
      delete next[prevIdx];
      return next;
    });
    setDragOffset({ x: 0, y: 0 });
    setFlyDirection(null);
  };

  // Keyboard navigation: ArrowLeft to reject, ArrowRight to accept, ArrowUp/S to swap, Backspace to undo
  useEffect(() => {
    if (!isOpen || isLoading || error || actions.length === 0 || currentIndex >= actions.length) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if typing inside an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleDecision('accept');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleDecision('reject');
      } else if ((e.key === 's' || e.key === 'S') && actions[currentIndex]?.actionType === 'merge') {
        e.preventDefault();
        swapMergeDirection();
      } else if ((e.key === 'Backspace' || e.key === 'z') && currentIndex > 0) {
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, error, actions, currentIndex, flyDirection]);

  // Pointer drag gesture handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (flyDirection) return;
    // Don't drag if clicking an interactive element
    if ((e.target as HTMLElement).closest('input, select, button, textarea, label')) {
      return;
    }
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || flyDirection) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setDragOffset({ x: dx, y: dy });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging || flyDirection) return;
    setIsDragging(false);

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const threshold = 85;
    if (dragOffset.x > threshold) {
      handleDecision('accept');
    } else if (dragOffset.x < -threshold) {
      handleDecision('reject');
    } else {
      // Spring back to center
      setDragOffset({ x: 0, y: 0 });
    }
  };

  // Accepted actions list for the review/summary stage
  const acceptedActions = useMemo(() => {
    return actions.filter((_, idx) => decisions[idx] === 'accept');
  }, [actions, decisions]);

  const rejectedCount = useMemo(() => {
    return Object.values(decisions).filter(d => d === 'reject').length;
  }, [decisions]);

  const handleApplyFinalChanges = async () => {
    if (acceptedActions.length === 0) {
      onClose();
      return;
    }

    setIsApplying(true);
    try {
      await onApplyChanges(acceptedActions);
      showToast(`Successfully applied ${acceptedActions.length} catalog clean-up changes!`);
      onClose();
    } catch (err: any) {
      console.error('Error applying clean changes:', err);
      showToast('Failed to apply changes. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  const currentAction = actions[currentIndex];
  const isFinishedReviewing = !isLoading && !error && actions.length > 0 && currentIndex >= actions.length;

  // Calculation for card drag style
  let cardTransform = '';
  let cardTransition = 'transform 0.15s ease-out, opacity 0.15s ease-out';

  if (flyDirection === 'right') {
    cardTransform = 'translate3d(130%, 20px, 0) rotate(22deg)';
    cardTransition = 'transform 0.28s ease-in, opacity 0.24s ease-in';
  } else if (flyDirection === 'left') {
    cardTransform = 'translate3d(-130%, 20px, 0) rotate(-22deg)';
    cardTransition = 'transform 0.28s ease-in, opacity 0.24s ease-in';
  } else if (isDragging) {
    const rot = (dragOffset.x / 14);
    cardTransform = `translate3d(${dragOffset.x}px, ${dragOffset.y * 0.3}px, 0) rotate(${rot}deg)`;
    cardTransition = 'none';
  } else {
    cardTransform = 'translate3d(0, 0, 0) rotate(0deg)';
    cardTransition = 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
  }

  // Stamp opacities
  const acceptStampOpacity = Math.min(1, Math.max(0, dragOffset.x / 70));
  const rejectStampOpacity = Math.min(1, Math.max(0, -dragOffset.x / 70));

  // Current item lookups
  const primaryItem = currentAction ? itemsMap.get(currentAction.primaryItemId) : undefined;
  const secondaryItem = currentAction && currentAction.secondaryItemId ? itemsMap.get(currentAction.secondaryItemId) : undefined;
  const primaryName = primaryItem ? primaryItem.name : currentAction?.primaryItemId || '';
  const secondaryName = secondaryItem ? secondaryItem.name : currentAction?.secondaryItemId || '';

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150 select-none">
      <div 
        className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-zinc-200 flex flex-col max-h-[94vh] overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 tracking-tight">Grocery Database Reconciliation</h2>
              <p className="text-[11px] text-zinc-500">
                Swipe cards: Right to Accept · Left to Reject
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top Progress & Stats Bar (when reviewing) */}
        {!isLoading && !error && actions.length > 0 && !isFinishedReviewing && (
          <div className="px-5 py-2.5 bg-zinc-50/50 border-b border-zinc-200/70 shrink-0 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-800">
                Suggestion {currentIndex + 1} of {actions.length}
              </span>
              <div className="flex items-center gap-1.5 text-[11px]">
                {acceptedActions.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    ✓ {acceptedActions.length} accepted
                  </span>
                )}
                {rejectedCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold border border-rose-200">
                    ✕ {rejectedCount} rejected
                  </span>
                )}
              </div>
            </div>

            {/* Undo button */}
            {currentIndex > 0 && (
              <button
                type="button"
                onClick={handleUndo}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-zinc-600 hover:text-zinc-950 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg shadow-3xs transition-colors cursor-pointer"
                title="Undo previous swipe"
              >
                <Undo2 className="w-3.5 h-3.5 text-zinc-500" />
                <span>Undo</span>
              </button>
            )}
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col justify-center min-h-[380px]">
          {/* Loading state */}
          {isLoading && (
            <div className="py-16 text-center space-y-4">
              <div className="relative inline-flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-indigo-50 border border-indigo-200 animate-ping opacity-30 absolute" />
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-200 flex items-center justify-center text-indigo-600">
                  <Sparkles className="w-6 h-6 animate-spin duration-1000" />
                </div>
              </div>
              <div className="space-y-1.5 max-w-sm mx-auto">
                <h3 className="text-sm font-bold text-zinc-900">
                  Analyzing catalog for duplicates and miscategorized items...
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Scanning {groceryItems.length} items for semantic overlap, inconsistent plurals, and supermarket aisles.
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {!isLoading && error && (
            <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-center space-y-3">
              <div className="inline-flex p-2 bg-red-100 text-red-600 rounded-full">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-red-900">
                  {error === 'GEMINI_API_KEY_MISSING' ? 'Gemini API Key Required' : 'Failed to analyze database'}
                </h3>
                <p className="text-xs text-red-700">
                  {error === 'GEMINI_API_KEY_MISSING' 
                    ? 'Please configure your Gemini API Key in the Settings connections tab to scan and optimize your database.' 
                    : error}
                </p>
              </div>
              {error === 'GEMINI_API_KEY_MISSING' && onNavigateTab ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateTab('settings');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Go to Connections Settings</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={fetchRecommendations}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 cursor-pointer shadow-xs"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Retry Analysis</span>
                </button>
              )}
            </div>
          )}

          {/* Clean / No actions state */}
          {!isLoading && !error && actions.length === 0 && (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="space-y-1 max-w-xs mx-auto">
                <h3 className="text-sm font-bold text-zinc-900">Your grocery database is clean!</h3>
                <p className="text-xs text-zinc-500">
                  No duplicates, naming discrepancies, or aisle misclassifications were detected across your {groceryItems.length} items.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Single Card View (Card Stack) */}
          {!isLoading && !error && actions.length > 0 && !isFinishedReviewing && currentAction && (
            <div className="relative w-full max-w-md mx-auto my-auto flex flex-col items-center">
              {/* Ghost Card Behind (Stack Depth Effect) */}
              {currentIndex + 1 < actions.length && (
                <div 
                  className="absolute inset-x-2 top-2 h-full rounded-2xl bg-zinc-100/80 border border-zinc-200/80 shadow-xs scale-[0.97] pointer-events-none transition-all"
                  aria-hidden="true"
                />
              )}

              {/* Active Swiping Card */}
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{
                  transform: cardTransform,
                  transition: cardTransition,
                  touchAction: 'none'
                }}
                className={`relative w-full bg-white rounded-2xl border border-zinc-200 shadow-xl p-4 sm:p-5 cursor-grab active:cursor-grabbing z-10 transition-shadow ${
                  isDragging ? 'shadow-2xl' : 'hover:border-zinc-300'
                }`}
              >
                {/* Visual Stamp Overlays for Swipe Feedback */}
                <div
                  style={{ opacity: acceptStampOpacity }}
                  className="absolute top-4 right-4 z-20 pointer-events-none border-2 border-emerald-500 bg-emerald-500/10 text-emerald-700 px-3 py-1 rounded-xl text-xs font-extrabold uppercase tracking-widest rotate-12 flex items-center gap-1 shadow-sm"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>ACCEPT</span>
                </div>

                <div
                  style={{ opacity: rejectStampOpacity }}
                  className="absolute top-4 left-4 z-20 pointer-events-none border-2 border-rose-500 bg-rose-500/10 text-rose-700 px-3 py-1 rounded-xl text-xs font-extrabold uppercase tracking-widest -rotate-12 flex items-center gap-1 shadow-sm"
                >
                  <X className="w-4 h-4 stroke-[3]" />
                  <span>REJECT</span>
                </div>

                {/* Card Type Header */}
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    {currentAction.actionType === 'merge' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200">
                        <GitMerge className="w-3.5 h-3.5 text-amber-700" />
                        Merge Duplicates
                      </span>
                    )}
                    {currentAction.actionType === 'rename' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-sky-100 text-sky-900 border border-sky-200">
                        <Edit3 className="w-3.5 h-3.5 text-sky-700" />
                        Standardize Name
                      </span>
                    )}
                    {currentAction.actionType === 'recategorize' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-200">
                        <ShoppingBag className="w-3.5 h-3.5 text-emerald-700" />
                        Aisle Fix
                      </span>
                    )}
                  </div>

                  <span className="text-[11px] font-mono text-zinc-400">
                    #{currentIndex + 1}
                  </span>
                </div>

                {/* Specific Card Options & Content */}
                <div className="py-3.5 space-y-3">
                  
                  {/* 1. Merge Duplicates with user choice of which definition to keep! */}
                  {currentAction.actionType === 'merge' && secondaryItem && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-zinc-800 tracking-tight">
                          Which definition would you like to keep?
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            swapMergeDirection();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer shadow-3xs"
                          title="Swap which item is kept and which is absorbed"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Swap</span>
                        </button>
                      </div>

                      {/* Interactive Choice Cards */}
                      <div className="grid grid-cols-1 gap-2">
                        {/* Choice 1: Currently Primary (Kept) */}
                        <div
                          className="p-3 rounded-xl border bg-indigo-50/40 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span>Keep as Primary</span>
                            </div>
                            <div className="font-extrabold text-sm text-zinc-950 truncate mt-0.5">
                              {primaryName}
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              {primaryItem?.category || 'General'} · step: {primaryItem?.increment || 1} {primaryItem?.unit || 'item'}
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-1 rounded-md shrink-0 border border-emerald-200">
                            Preserved
                          </span>
                        </div>

                        {/* Choice 2: Currently Secondary (Absorbed) - Clicking swaps direction! */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            swapMergeDirection();
                          }}
                          className="p-3 rounded-xl border bg-zinc-50 hover:bg-zinc-100/70 border-zinc-200 hover:border-zinc-300 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                              <Trash2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>Absorb & Save as Alias</span>
                            </div>
                            <div className="font-bold text-sm text-zinc-700 group-hover:text-zinc-900 truncate mt-0.5">
                              {secondaryName}
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              {secondaryItem?.category || 'General'} · step: {secondaryItem?.increment || 1} {secondaryItem?.unit || 'item'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              swapMergeDirection();
                            }}
                            className="text-[11px] font-bold text-indigo-600 bg-white border border-indigo-200 px-2 py-1 rounded-md group-hover:bg-indigo-50 shrink-0 shadow-3xs"
                          >
                            Keep this instead ➔
                          </button>
                        </div>
                      </div>

                      {/* Summary callout */}
                      <div className="text-[11px] text-zinc-600 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/80 flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                        <span>
                          <strong>"{primaryName}"</strong> will be kept. <strong>"{secondaryName}"</strong> will be merged into its aliases for smart recipe matching.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 2. Standardize Name with user options */}
                  {currentAction.actionType === 'rename' && (
                    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-bold text-zinc-800 tracking-tight">
                          Standardize Name:
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateCurrentAction({ newName: (currentAction.newName || primaryName).toLowerCase() })}
                            className="text-[11px] font-bold px-2 py-0.5 bg-zinc-100 hover:bg-zinc-200 rounded border border-zinc-200 text-zinc-700 shadow-3xs cursor-pointer"
                          >
                            lowercase
                          </button>
                          <button
                            type="button"
                            onClick={() => updateCurrentAction({ newName: toTitleCase(currentAction.newName || primaryName) })}
                            className="text-[11px] font-bold px-2 py-0.5 bg-zinc-100 hover:bg-zinc-200 rounded border border-zinc-200 text-zinc-700 shadow-3xs cursor-pointer"
                          >
                            Title Case
                          </button>
                          <button
                            type="button"
                            onClick={() => updateCurrentAction({ newName: primaryName })}
                            className="text-[11px] font-bold px-2 py-0.5 bg-zinc-100 hover:bg-zinc-200 rounded border border-zinc-200 text-zinc-500 shadow-3xs cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2">
                        <div className="text-[11px] text-zinc-500 flex items-center gap-2">
                          <span>Original name:</span>
                          <span className="line-through font-semibold text-zinc-400">{primaryName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ArrowRight className="w-4 h-4 text-sky-600 shrink-0" />
                          <input
                            type="text"
                            value={currentAction.newName || ''}
                            onChange={(e) => updateCurrentAction({ newName: e.target.value })}
                            className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-zinc-300 rounded-lg focus:outline-none focus:border-indigo-500 font-bold text-zinc-950 shadow-2xs"
                            placeholder="Enter standardized name"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. Recategorize / Aisle Fix with user options */}
                  {currentAction.actionType === 'recategorize' && (
                    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs font-bold text-zinc-800 tracking-tight block">
                        Supermarket Aisle Assignment:
                      </span>

                      <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs text-zinc-600">
                          <span>Item: <strong className="text-zinc-900">{primaryName}</strong></span>
                          <span>Current: <span className="line-through text-zinc-400">{primaryItem?.category || 'Pantry'}</span></span>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-xs font-semibold text-zinc-500 shrink-0">New Aisle:</span>
                          <select
                            value={currentAction.newAisle || primaryItem?.category || 'Produce'}
                            onChange={(e) => updateCurrentAction({ newAisle: e.target.value })}
                            className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-zinc-300 rounded-lg focus:outline-none focus:border-indigo-500 font-bold text-emerald-800 cursor-pointer shadow-2xs"
                          >
                            {availableAisles.map(aisle => (
                              <option key={aisle} value={aisle}>
                                {aisle} {aisle === currentAction.newAisle ? '(AI Recommended)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Explanation Callout */}
                  <div className="text-[11px] text-zinc-500 bg-zinc-50/60 p-2.5 rounded-xl border border-zinc-200 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                    <span>{currentAction.reason}</span>
                  </div>

                </div>

                {/* Footer Controls: Big Swipe/Reject/Accept Action Buttons */}
                <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDecision('reject');
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100/80 text-rose-700 text-xs font-bold transition-all shadow-3xs cursor-pointer active:scale-95"
                  >
                    <ThumbsDown className="w-4 h-4 stroke-[2.5]" />
                    <span>Reject (←)</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDecision('accept');
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-emerald-200 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                  >
                    <ThumbsUp className="w-4 h-4 stroke-[2.5]" />
                    <span>Accept (→)</span>
                  </button>
                </div>

                {/* Keyboard & gesture hint */}
                <div className="text-[11px] text-zinc-400 text-center pt-2">
                  Drag card left to reject, right to accept · Use keyboard ← / →
                </div>
              </div>
            </div>
          )}

          {/* Finished All Cards: Review & Apply Summary Stage */}
          {isFinishedReviewing && (
            <div className="py-4 space-y-4 max-w-lg mx-auto w-full">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-zinc-900 tracking-tight">Review Complete!</h3>
                <p className="text-xs text-zinc-500">
                  You accepted {acceptedActions.length} of {actions.length} suggestions.
                </p>
              </div>

              {/* Accepted changes list breakdown */}
              {acceptedActions.length > 0 ? (
                <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-xs max-h-64 overflow-y-auto divide-y divide-zinc-100">
                  <div className="bg-zinc-50 px-4 py-2 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                    Ready to Apply ({acceptedActions.length}):
                  </div>
                  {acceptedActions.map((action, i) => {
                    const prim = itemsMap.get(action.primaryItemId);
                    const sec = action.secondaryItemId ? itemsMap.get(action.secondaryItemId) : undefined;
                    return (
                      <div key={i} className="p-3 text-xs flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {action.actionType === 'merge' && (
                              <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                Merge
                              </span>
                            )}
                            {action.actionType === 'rename' && (
                              <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                                Standardize
                              </span>
                            )}
                            {action.actionType === 'recategorize' && (
                              <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                Aisle
                              </span>
                            )}
                            <span className="font-bold text-zinc-900 truncate">
                              {action.actionType === 'merge' && `Keep "${prim?.name || action.primaryItemId}" (absorb "${sec?.name || action.secondaryItemId}")`}
                              {action.actionType === 'rename' && `Rename to "${action.newName}"`}
                              {action.actionType === 'recategorize' && `Move "${prim?.name}" to ${action.newAisle}`}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                            {action.reason}
                          </div>
                        </div>
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 bg-zinc-50 border border-zinc-200 rounded-2xl text-center text-xs text-zinc-500 space-y-2">
                  <p>All suggestions were rejected. No changes will be applied to your grocery database.</p>
                </div>
              )}

              {/* Action buttons on finish */}
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentIndex(0);
                    setDecisions({});
                  }}
                  className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-zinc-200 hover:bg-zinc-100 text-zinc-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Start Over</span>
                </button>

                {acceptedActions.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleApplyFinalChanges}
                    disabled={isApplying}
                    className="w-full sm:w-auto flex-2 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    {isApplying ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Applying Changes...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Apply {acceptedActions.length} Changes</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full sm:w-auto flex-2 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer (when reviewing cards) */}
        {!isLoading && !error && actions.length > 0 && !isFinishedReviewing && (
          <div className="px-5 py-3 border-t border-zinc-200 bg-zinc-50/70 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 cursor-pointer"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2">
              {acceptedActions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCurrentIndex(actions.length)} // Jump to review
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                >
                  Skip to Review ({acceptedActions.length} accepted)
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
