/**
 * The Planning tab: meals to drag onto the week (Classic) or the seven days to tap (List), the
 * week's bar (‹ week ›, Send to list), and the windows for choosing and changing a day's meal.
 * The pieces live in ./planner: the hooks hold the logic (which week, the meals panel, the day
 * picker, changing the week), and src/planning.ts has the week changes as plain functions.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { Copy } from 'lucide-react';
import Notice from './Notice';
import { Recipe, MealPlan, PlannedMeal, TabName } from '../types';
import { DAYS_OF_WEEK, canPlanFollowingWeek } from '../utils';
import { changedDaysSinceList, cooksForText, leftoverSourceDay } from '../planning';
import { todayISO } from '../recipeInfo';
import { RecipeModal } from './CookBookTab';
import { DayListRow, WeekDayCard, WeekGlance, DaySheet } from './planner/DayListRow';
import PlanningToolbar from './planner/PlanningToolbar';
import RecipeGrid from './planner/RecipeGrid';
import { WeekMenu, WeekDockBar } from './planner/WeekBar';
import AddToDaySheet from './planner/AddToDaySheet';
import DayPickerModal, { QuickMeal } from './planner/DayPickerModal';
import CustomMealModal, { CustomMealDraft } from './planner/CustomMealModal';
import SendToListModal, { NoMealsModal } from './planner/SendToListModal';
import CopyWeekModal from './planner/CopyWeekModal';
import { HowAreYouHavingIt, RemoveLeftoversQuestion } from './planner/LeftoverPrompts';
import FreezerWidget from './planner/FreezerWidget';
import { SidesModalInner } from './planner/SidesModal';
import { usePlanToast } from './planner/usePlanToast';
import { usePlanningWeek } from './planner/usePlanningWeek';
import { usePlanningLayout, useMealBrowser } from './planner/useMealBrowser';
import { useDayPicker } from './planner/useDayPicker';
import { useWeekEditor } from './planner/useWeekEditor';
import type  { AppStore } from '../store';

interface PlanningTabProps {
  store: AppStore;
  onNavigateTab?: (tab: TabName, planId?: string) => void;
  targetPlanId?: string | null;
  /** A recipe to plan, sent from the Cookbook's "Add to a day…". */
  pendingAddRecipeId?: string | null;
  onPendingAddDone?: () => void;
}

export default function PlanningTab({ store, onNavigateTab, targetPlanId, pendingAddRecipeId, onPendingAddDone }: PlanningTabProps) {
  // New meals are planned for your usual number of people (Settings → Household).
  const defaultServings = Math.max(1, Math.min(24, Number(store.state.preferences?.defaultServings) || 2));
  const { toastMessage, toastAction, setToastMessage } = usePlanToast();
  const { maxWeeks, weekLabel, allowedPlans, setSelectedPlanId, currentPlan, prevPlan, nextPlan, planFollowingWeek } = usePlanningWeek(store, targetPlanId, setToastMessage);
  const { planningView, setPlanningView, prefs, mealRowsLayout, setMealRowsLayout, cardFields } = usePlanningLayout(store);
  const meals = useMealBrowser(store, currentPlan);
  const { today } = meals;

  // Windows and menus
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // "Select meal for <day>"
  const [daySheet, setDaySheet] = useState<string | null>(null); // the day's panel (people, sides, notes, change, move, remove)
  const [customMeal, setCustomMeal] = useState<CustomMealDraft | null>(null); // takeaway, eating out, no meal
  const [sidesEditingMeal, setSidesEditingMeal] = useState<{ dayName: string; meal: PlannedMeal } | null>(null);
  // Copy-a-week picker: 'pick' lists weeks; a plan means "confirm replacing this week's meals with it".
  const [copyWeekState, setCopyWeekState] = useState<'pick' | MealPlan | null>(null);
  const [draggedRecipe, setDraggedRecipe] = useState<Recipe | null>(null);
  const [assigningRecipe, setAssigningRecipe] = useState<Recipe | null>(null); // "Add to a day"
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [showWeekDropdown, setShowWeekDropdown] = useState(false);
  const [showViewOptions, setShowViewOptions] = useState(false);
  const [showFinalizeConfirmModal, setShowFinalizeConfirmModal] = useState(false);
  const [showNoMealsToFinalizeModal, setShowNoMealsToFinalizeModal] = useState(false);

  const picker = useDayPicker(store, currentPlan, selectedDay);
  const editor = useWeekEditor({ store, currentPlan, defaultServings, weekLabel, setToastMessage, onNavigateTab });

  // "Add to a day…" from the Cookbook: open the day chooser for that recipe.
  useEffect(() => {
    if (!pendingAddRecipeId) return;
    const recipe = (store.state.recipes || []).find((r: Recipe) => r.id === pendingAddRecipeId);
    if (recipe) setAssigningRecipe(recipe);
    onPendingAddDone?.();
  }, [pendingAddRecipeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchToPlan = (id: string) => { setSelectedPlanId(id); store.setSelectedPlanId?.(id); setShowWeekDropdown(false); };
  const canPlanNext = canPlanFollowingWeek(currentPlan?.startDate, undefined, maxWeeks);
  // Days changed since this week was sent to the shopping list
  const changedDays = changedDaysSinceList(currentPlan);

  // Jump to a day (week-at-a-glance), and open each week on today when it's in view
  const stripRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const jumpToDay = (day: string, smooth = true) => {
    const strip = stripRef.current;
    const card = strip?.querySelector(`[data-week-day="${day}"]`) as HTMLElement | null;
    if (strip && card) strip.scrollTo({ left: Math.max(0, card.offsetLeft - 8), behavior: smooth ? 'smooth' : 'auto' });
    const row = listRef.current?.querySelector(`[data-list-day="${day}"]`) as HTMLElement | null;
    if (row) row.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  };
  useEffect(() => {
    if (!currentPlan) return;
    const todayDay = DAYS_OF_WEEK.find((d) => currentPlan!.days[d]?.date === todayISO());
    const t = setTimeout(() => {
      if (todayDay) jumpToDay(todayDay, false);
      else if (stripRef.current) stripRef.current.scrollLeft = 0;
    }, 30);
    return () => clearTimeout(t);
  }, [currentPlan?.id, planningView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Meals planned across the week, and the days with none.
  const totalPlannedMeals = useMemo(() => {
    if (!currentPlan) return 0;
    return DAYS_OF_WEEK.reduce((acc, day) => acc + (currentPlan.days[day]?.meals?.length || 0), 0);
  }, [currentPlan]);
  const unallocatedDays = useMemo(() => {
    if (!currentPlan) return [];
    return DAYS_OF_WEEK.filter(day => !currentPlan.days[day] || currentPlan.days[day].meals.length === 0);
  }, [currentPlan]);

  // Weeks you could copy the meals from (most recent first).
  const copyCandidates: MealPlan[] = useMemo(() => {
    return (store.state.mealPlans || [])
      .filter((p: MealPlan) => p.id !== currentPlan?.id && Object.values(p.days || {}).some((d) => d?.meals?.length))
      .sort((a: MealPlan, b: MealPlan) => b.startDate.localeCompare(a.startDate))
      .slice(0, 12);
  }, [store.state.mealPlans, currentPlan?.id]);

  // ---------- Putting meals on days (one meal per day) ----------
  /** Dropped onto a day in the week strip. */
  const handleDrop = (dayName: string) => {
    if (!draggedRecipe || !currentPlan) return;
    setDraggedRecipe(null);
    editor.placeRecipe(dayName, draggedRecipe);
  };
  /** "Add to a day". */
  const assignRecipeToDay = (dayName: string, recipe: Recipe) => {
    if (!currentPlan) return;
    setAssigningRecipe(null);
    editor.placeRecipe(dayName, recipe);
  };
  /** Chosen in "Select meal for <day>" (stays open while it asks how you're having it). */
  const pickRecipe = (dayName: string, recipe: Recipe) => { if (editor.placeRecipe(dayName, recipe)) setSelectedDay(null); };
  const pickBatch = (dayName: string, batchId: string) => { if (editor.addCustomMeal(dayName, 'batch', batchId)) setSelectedDay(null); };
  const chooseHow = (how: 'leftover' | 'freezer' | 'fresh') => { if (editor.confirmHow(how)) setSelectedDay(null); };
  /** Takeaway, eating out or no meal: ask for a note (and people) first. */
  const pickQuick = (type: QuickMeal) => {
    const day = selectedDay;
    if (!day) return;
    setSelectedDay(null);
    setCustomMeal({ dayName: day, type, note: '', servings: type === 'no_meal' ? 0 : defaultServings });
  };

  return (
    <div className="h-full flex flex-col app-page relative overflow-hidden">
      {toastMessage && <Notice text={toastMessage} action={toastAction || undefined} onDone={() => setToastMessage(null)} />}

      {/* The meals to plan (Classic), or just the title (List) */}
      <div className={`${planningView === 'list' ? 'shrink-0' : 'flex-1 min-h-0'} flex flex-col relative ${showViewOptions ? 'z-35' : 'z-10'}`}>
        <PlanningToolbar
          planningView={planningView}
          onPlanningView={setPlanningView}
          searchOpen={meals.isSearchExpanded}
          onSearchOpen={meals.setIsSearchExpanded}
          search={meals.recipeSearch}
          onSearch={meals.setRecipeSearch}
          quickFilters={meals.quickFilters}
          onToggleFilter={meals.toggleQuickFilter}
          optionsOpen={showViewOptions}
          onOptionsOpen={setShowViewOptions}
          mealRowsLayout={mealRowsLayout}
          onMealRowsLayout={setMealRowsLayout}
          recipeSort={meals.recipeSort}
          onRecipeSort={meals.setRecipeSort}
          favFirst={meals.favFirst}
          onFavFirst={meals.setFavFirst}
          prefs={prefs}
          onCardPref={(pref) => store.updatePreferences((p) => ({ [pref]: p[pref] === false }))}
        />

        {planningView === 'classic' && (
          <RecipeGrid
            recipes={meals.sortedRecipes}
            matching={meals.filteredRecipes.length}
            total={store.state.recipes.length}
            filtering={!!meals.recipeSearch.trim() || meals.quickFilters.length > 0}
            quickFilters={meals.quickFilters}
            noFavourites={!store.state.recipes.some((r: Recipe) => r.favourite)}
            onClear={meals.clearFilters}
            mealRowsLayout={mealRowsLayout}
            cardFields={cardFields}
            history={meals.recipeHistory}
            batches={store.state.batches}
            ratings={store.state.preferences?.ratings}
            today={today}
            daysInWeek={meals.daysInWeek}
            onOpen={setViewingRecipe}
            onDragStart={setDraggedRecipe}
            onDragEnd={() => setDraggedRecipe(null)}
          />
        )}
      </div>

      {/* The week (the whole page in the List view) */}
      <div className={`bg-white border-t border-zinc-200/90 ${showWeekDropdown ? 'z-40' : 'z-20'} flex flex-col transition-all duration-200 relative ${
        planningView === 'list'
          ? 'flex-1 min-h-0'
          : 'shadow-xl shrink-0 h-[38%] md:h-[40%] min-h-[265px] md:min-h-[270px] max-h-[330px] md:max-h-[380px]'
      }`}>
        {showWeekDropdown && (
          <WeekMenu
            plans={allowedPlans}
            currentPlan={currentPlan}
            weekLabel={weekLabel}
            onPick={switchToPlan}
            onClose={() => setShowWeekDropdown(false)}
            canCopy={!!currentPlan && currentPlan.status !== 'finalized' && copyCandidates.length > 0}
            onCopy={() => { setShowWeekDropdown(false); setCopyWeekState('pick'); }}
            canPlanNext={canPlanNext}
            maxWeeks={maxWeeks}
            onPlanNext={() => { planFollowingWeek(); setShowWeekDropdown(false); }}
            onPastWeeks={onNavigateTab ? () => { setShowWeekDropdown(false); onNavigateTab('settings'); } : undefined}
          />
        )}

        <WeekDockBar
          title={currentPlan ? weekLabel(currentPlan.startDate) : ''}
          menuOpen={showWeekDropdown}
          onMenu={() => setShowWeekDropdown(!showWeekDropdown)}
          prevPlan={prevPlan}
          onPrev={() => prevPlan && switchToPlan(prevPlan.id)}
          canNext={!!nextPlan || canPlanNext}
          onNext={() => {
            if (nextPlan) switchToPlan(nextPlan.id);
            else if (canPlanNext) planFollowingWeek();
          }}
          status={currentPlan?.status}
          changedDays={changedDays}
          mealsPlanned={totalPlannedMeals}
          onUpdateList={editor.updateList}
          onSent={() => setToastMessage('This week is on the shopping list.', onNavigateTab ? { label: 'See the list', run: () => onNavigateTab('shop', currentPlan?.id) } : null)}
          onNoMeals={() => setShowNoMealsToFinalizeModal(true)}
          onSend={() => setShowFinalizeConfirmModal(true)}
        />

        {currentPlan && (
          <WeekGlance
            days={currentPlan.days}
            today={today}
            onJump={jumpToDay}
            action={currentPlan.status !== 'finalized' && totalPlannedMeals === 0 && copyCandidates.length > 0 ? (
              <button
                type="button"
                onClick={() => setCopyWeekState('pick')}
                className="h-8 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 rounded-lg border border-emerald-200 cursor-pointer whitespace-nowrap"
                title="Fill this week with the meals from another week"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy a week</span>
              </button>
            ) : undefined}
          />
        )}

        {planningView === 'list' && currentPlan ? (
          <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-50/60" data-day-list ref={listRef}>
            <div className="max-w-2xl mx-auto w-full p-3 space-y-2 pb-6">
              {DAYS_OF_WEEK.map(day => {
                const dayPlan = currentPlan!.days[day];
                const meal = dayPlan?.meals?.[0] || null;
                return (
                  <DayListRow
                    key={day}
                    day={day}
                    dayPlan={dayPlan}
                    meal={meal}
                    today={today}
                    cooksFor={cooksForText(currentPlan!.days, day, meal)}
                    fromDay={leftoverSourceDay(currentPlan!.days, day, meal)}
                    onOpen={() => (meal ? setDaySheet(day) : setSelectedDay(day))}
                  />
                );
              })}
            </div>
          </div>
        ) : (
        /* The week strip: drop recipes onto a day, tap a day for its panel */
        <div className="flex-1 p-2 md:p-3 overflow-x-auto overflow-y-hidden min-h-0 flex flex-col scrollbar-thin" ref={stripRef} data-week-strip>
          <div className="grid grid-cols-7 gap-2 sm:gap-3 min-w-[1120px] md:min-w-0 flex-1 h-full">
            {currentPlan && DAYS_OF_WEEK.map(day => {
              const dayPlan = currentPlan!.days[day];
              const meal = dayPlan?.meals?.[0] || null;
              return (
                <WeekDayCard
                  key={day}
                  day={day}
                  dayPlan={dayPlan}
                  meal={meal}
                  today={today}
                  cooksFor={cooksForText(currentPlan!.days, day, meal)}
                  fromDay={leftoverSourceDay(currentPlan!.days, day, meal)}
                  dragActive={!!draggedRecipe}
                  onDrop={() => handleDrop(day)}
                  onOpen={() => setDaySheet(day)}
                  onAdd={() => setSelectedDay(day)}
                />
              );
            })}
          </div>
        </div>
        )}
      </div>

      {/* The day's panel: people, sides, notes, change, move or swap, remove */}
      {daySheet && currentPlan && currentPlan.days[daySheet]?.meals?.[0] && (() => {
        const day = daySheet;
        const meal = currentPlan.days[day].meals[0];
        const recipe = meal.recipeId ? store.state.recipes.find((r: Recipe) => r.id === meal.recipeId) : null;
        return (
          <DaySheet
            key={`${day}-${meal.id}`}
            day={day}
            dayPlan={currentPlan.days[day]}
            meal={meal}
            cooksFor={cooksForText(currentPlan.days, day, meal)}
            fromDay={leftoverSourceDay(currentPlan.days, day, meal)}
            plannedDays={DAYS_OF_WEEK.map((d) => ({ day: d, date: currentPlan!.days[d]?.date, meal: currentPlan!.days[d]?.meals?.[0] || null }))}
            hasRecipe={!!recipe}
            onSave={(patch) => editor.saveDayDetails(day, meal.id, patch)}
            onSides={() => { setDaySheet(null); setSidesEditingMeal({ dayName: day, meal }); }}
            onChangeMeal={() => { setDaySheet(null); setSelectedDay(day); }}
            onMove={(to) => { setDaySheet(null); editor.moveDayMeal(day, to); }}
            onRemove={() => { setDaySheet(null); editor.removeMeal(day, meal.id); }}
            onOpenRecipe={recipe ? () => { setDaySheet(null); setViewingRecipe(recipe); } : undefined}
            onClose={() => setDaySheet(null)}
          />
        );
      })()}

      {assigningRecipe && (
        <AddToDaySheet
          recipe={assigningRecipe}
          plans={allowedPlans}
          currentPlan={currentPlan}
          weekLabel={weekLabel}
          onPickWeek={setSelectedPlanId}
          today={today}
          onPick={(day) => assignRecipeToDay(day, assigningRecipe)}
          onClose={() => setAssigningRecipe(null)}
        />
      )}

      {selectedDay && (
        <DayPickerModal
          day={selectedDay}
          replacing={!!currentPlan?.days[selectedDay]?.meals?.length}
          recipes={store.state.recipes}
          search={picker.pickerSearch}
          onSearch={picker.setPickerSearch}
          earlier={picker.pickerRecipes.earlier}
          others={picker.pickerRecipes.all}
          batches={picker.pickerBatches}
          onRecipe={(r) => pickRecipe(selectedDay, r)}
          onQuick={pickQuick}
          onBatch={(batchId) => pickBatch(selectedDay, batchId)}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {customMeal && (
        <CustomMealModal
          draft={customMeal}
          onChange={setCustomMeal}
          onAdd={() => {
            if (editor.addCustomMeal(customMeal.dayName, customMeal.type, undefined, customMeal.note, customMeal.servings)) setSelectedDay(null);
            setCustomMeal(null);
          }}
          onClose={() => setCustomMeal(null)}
        />
      )}

      {showFinalizeConfirmModal && currentPlan && (
        <SendToListModal
          plan={currentPlan}
          recipes={store.state.recipes}
          emptyDays={unallocatedDays}
          onEditDay={(day, hasMeal) => {
            setShowFinalizeConfirmModal(false);
            if (hasMeal) setDaySheet(day); else setSelectedDay(day);
          }}
          onSend={() => { setShowFinalizeConfirmModal(false); editor.sendToList(); }}
          onClose={() => setShowFinalizeConfirmModal(false)}
        />
      )}

      {showNoMealsToFinalizeModal && <NoMealsModal onClose={() => setShowNoMealsToFinalizeModal(false)} />}

      {copyWeekState && currentPlan && (
        <CopyWeekModal
          state={copyWeekState}
          plan={currentPlan}
          candidates={copyCandidates}
          mealsPlanned={totalPlannedMeals}
          weekLabel={weekLabel}
          onState={setCopyWeekState}
          onCopy={(source) => { if (editor.copyWeek(source)) setCopyWeekState(null); }}
          onClose={() => setCopyWeekState(null)}
        />
      )}

      {editor.removeLeftoversPrompt && (
        <RemoveLeftoversQuestion prompt={editor.removeLeftoversPrompt} onConfirm={editor.confirmRemoveWithLeftovers} onCancel={editor.cancelRemoveLeftovers} />
      )}

      {editor.howPrompt && (
        <HowAreYouHavingIt prompt={editor.howPrompt} defaultServings={defaultServings} onChoose={chooseHow} onCancel={editor.cancelHow} />
      )}

      <FreezerWidget batches={store.state.batches} recipes={store.state.recipes} />

      {viewingRecipe && (
        <RecipeModal
          store={store}
          recipe={viewingRecipe}
          onClose={() => setViewingRecipe(null)}
          onAddToDay={(recipe) => { setViewingRecipe(null); setAssigningRecipe(recipe); }}
          onNavigateTab={onNavigateTab}
        />
      )}

      {sidesEditingMeal && (
        <SidesModalInner
          dayName={sidesEditingMeal.dayName}
          meal={sidesEditingMeal.meal}
          store={store}
          onClose={() => setSidesEditingMeal(null)}
          onSave={(updatedSides) => { if (editor.saveSides(sidesEditingMeal.dayName, sidesEditingMeal.meal.id, updatedSides)) setSidesEditingMeal(null); }}
        />
      )}
    </div>
  );
}
