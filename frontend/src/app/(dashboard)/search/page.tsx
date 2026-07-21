'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/hooks/use-translation'
import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Search, ChevronDown, AlertCircle, Settings, Save, MessageCircleQuestion } from 'lucide-react'
import { useSearch } from '@/lib/hooks/use-search'
import { useAsk } from '@/lib/hooks/use-ask'
import { useModelDefaults, useModels } from '@/lib/hooks/use-models'
import { useProjects } from '@/lib/hooks/use-projects'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { EmptyState } from '@/components/common/EmptyState'
import { InlineSkeleton, SearchButtonSkeleton } from '@/components/common/LoadingSkeletons'
import { StreamingResponse } from '@/components/search/StreamingResponse'
import { AdvancedModelsDialog } from '@/components/search/AdvancedModelsDialog'
import { SaveToProjectsDialog } from '@/components/search/SaveToProjectsDialog'

const SEARCH_PAGE_SIZE = 30

export default function SearchPage() {
  const { t } = useTranslation()
  // URL params
  const searchParams = useSearchParams()
  const urlQuery = searchParams?.get('q') || ''
  const rawMode = searchParams?.get('mode')
  const urlMode = rawMode === 'search' ? 'search' : 'ask'

  // Tab state (controlled)
  const [activeTab, setActiveTab] = useState<'ask' | 'search'>(
    urlMode === 'search' ? 'search' : 'ask'
  )

  // Search state
  const [searchQuery, setSearchQuery] = useState(urlMode === 'search' ? urlQuery : '')
  const [searchType, setSearchType] = useState<'text' | 'vector' | 'hybrid'>('text')
  const [searchSources, setSearchSources] = useState(true)
  const [searchNotes, setSearchNotes] = useState(true)
  const [projectId, setProjectId] = useState<string>('all')

  // Ask state
  const [askQuestion, setAskQuestion] = useState(urlMode === 'ask' ? urlQuery : '')

  // Advanced models dialog
  const [showAdvancedModels, setShowAdvancedModels] = useState(false)
  const [customModels, setCustomModels] = useState<{
    strategy: string
    answer: string
    finalAnswer: string
  } | null>(null)

  // Save to notebooks dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [searchLimit, setSearchLimit] = useState(SEARCH_PAGE_SIZE)

  const needsModelDefaults =
    activeTab === 'ask' ||
    urlMode === 'ask' ||
    showAdvancedModels ||
    (activeTab === 'search' && (searchType === 'vector' || searchType === 'hybrid'))

  // Hooks
  const searchMutation = useSearch()
  const ask = useAsk()
  const { data: projects } = useProjects(false)
  const { data: modelDefaults, isLoading: modelsLoading } = useModelDefaults({
    enabled: needsModelDefaults,
  })
  const { data: availableModels } = useModels({
    enabled: needsModelDefaults || showAdvancedModels,
  })
  const { openModal } = useModalManager()

  const modelNameById = useMemo(() => {
    if (!availableModels) {
      return new Map<string, string>()
    }
    return new Map(availableModels.map((model) => [model.id, model.name]))
  }, [availableModels])

  const resolveModelName = (id?: string | null) => {
    if (!id) return t('searchPage.notSet')
    return modelNameById.get(id) ?? id
  }

  const hasEmbeddingModel = !!modelDefaults?.default_embedding_model

  // Track if we've already auto-triggered from URL params
  const hasAutoTriggeredRef = useRef(false)
  const lastUrlParamsRef = useRef({ q: '', mode: '' })

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return

    setSearchLimit(SEARCH_PAGE_SIZE)
    searchMutation.mutate({
      query: searchQuery,
      type: searchType,
      limit: SEARCH_PAGE_SIZE,
      search_sources: searchSources,
      search_artifacts: searchNotes,
      search_notes: searchNotes,
      minimum_score: 0.2,
      project_id: projectId !== 'all' ? projectId : undefined,
    })
  }, [searchQuery, searchType, searchSources, searchNotes, projectId, searchMutation])

  const handleLoadMoreResults = useCallback(() => {
    if (!searchQuery.trim() || !searchMutation.data) return

    const nextLimit = Math.min(
      searchMutation.data.total_count,
      searchLimit + SEARCH_PAGE_SIZE
    )
    if (nextLimit <= searchLimit) return

    setSearchLimit(nextLimit)
    searchMutation.mutate({
      query: searchQuery,
      type: searchType,
      limit: nextLimit,
      search_sources: searchSources,
      search_artifacts: searchNotes,
      search_notes: searchNotes,
      minimum_score: 0.2,
      project_id: projectId !== 'all' ? projectId : undefined,
    })
  }, [searchQuery, searchType, searchSources, searchNotes, searchLimit, projectId, searchMutation])

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleAsk = useCallback(() => {
    if (!askQuestion.trim() || !modelDefaults?.default_chat_model) return

    const models = customModels || {
      strategy: modelDefaults.default_chat_model,
      answer: modelDefaults.default_chat_model,
      finalAnswer: modelDefaults.default_chat_model
    }

    ask.sendAsk(askQuestion, models, {
      project_id: projectId !== 'all' ? projectId : undefined,
      retrieval_mode: 'auto',
    })
  }, [askQuestion, modelDefaults, customModels, ask, projectId])

  // Auto-trigger search/ask when arriving with URL params
  useEffect(() => {
    // Skip if already triggered or no query
    if (hasAutoTriggeredRef.current || !urlQuery) return

    // Wait for models to load before triggering ask
    if (urlMode === 'ask' && modelsLoading) return

    if (urlMode === 'search') {
      handleSearch()
      hasAutoTriggeredRef.current = true
    } else if (urlMode === 'ask' && modelDefaults?.default_chat_model) {
      handleAsk()
      hasAutoTriggeredRef.current = true
    }
  }, [urlQuery, urlMode, modelsLoading, modelDefaults, handleSearch, handleAsk])

  // Handle URL param changes while on page (e.g., from command palette again)
  useEffect(() => {
    const currentQ = searchParams?.get('q') || ''
    const rawCurrentMode = searchParams?.get('mode')
    const currentMode = rawCurrentMode === 'search' ? 'search' : 'ask'

    // Check if URL params have changed
    if (currentQ !== lastUrlParamsRef.current.q || currentMode !== lastUrlParamsRef.current.mode) {
      lastUrlParamsRef.current = { q: currentQ, mode: currentMode }

      if (currentQ) {
        // Update state based on mode
        if (currentMode === 'search') {
          setSearchQuery(currentQ)
          setActiveTab('search')
          // Reset trigger flag so we auto-trigger with new params
          hasAutoTriggeredRef.current = false
        } else {
          setAskQuestion(currentQ)
          setActiveTab('ask')
          hasAutoTriggeredRef.current = false
        }
      }
    }
  }, [searchParams])

  return (
          <div className={`flex-1 overflow-y-auto ${pageContentClassName}`}>
        <div className={pageSectionGapClassName}>
        <PageHeader title={t('searchPage.askAndSearch')} />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'ask' | 'search')} className={`w-full ${pageSectionGapClassName}`}>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('searchPage.chooseAMode')}</p>
            <TabsList aria-label={t('common.accessibility.searchKB')} className="h-8 w-full max-w-xl">
              <TabsTrigger value="ask" className="gap-1.5 text-xs">
                <MessageCircleQuestion className="h-3.5 w-3.5" />
                {t('searchPage.askBeta')}
              </TabsTrigger>
              <TabsTrigger value="search" className="gap-1.5 text-xs">
                <Search className="h-3.5 w-3.5" />
                {t('searchPage.search')}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="ask" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>{t('searchPage.askYourKb')}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t('searchPage.askYourKbDesc')}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Question Input */}
                <div className="space-y-2">
                  <Label htmlFor="ask-question">{t('searchPage.question')}</Label>
                  <Textarea
                    id="ask-question"
                    name="ask-question"
                    placeholder={t('searchPage.enterQuestionPlaceholder')}
                    value={askQuestion}
                    onChange={(e) => setAskQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      // Submit on Cmd/Ctrl+Enter
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !ask.isStreaming && askQuestion.trim()) {
                        e.preventDefault()
                        handleAsk()
                      }
                    }}
                    disabled={ask.isStreaming}
                    rows={3}
                    aria-label={t('common.accessibility.enterQuestion')}
                  />
                  <p className="text-xs text-muted-foreground">{t('searchPage.pressToSubmit')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ask-project">{t('searchPage.projectScope')}</Label>
                  <Select
                    value={projectId}
                    onValueChange={setProjectId}
                    disabled={ask.isStreaming}
                  >
                    <SelectTrigger id="ask-project">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('searchPage.allProjects')}</SelectItem>
                      {(projects ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Models Display */}
                {!hasEmbeddingModel ? (
                  <div className="flex items-center gap-2 p-3 text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/20 rounded-md">
                    <AlertCircle className="h-4 w-4" />
                    <span>{t('searchPage.noEmbeddingModel')}</span>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">
                          {customModels ? t('searchPage.usingCustomModels') : t('searchPage.usingDefaultModels')}
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAdvancedModels(true)}
                          disabled={ask.isStreaming}
                          className="h-auto py-1 px-2"
                        >
                          <Settings className="h-3 w-3 mr-1" />
                          {t('searchPage.advanced')}
                        </Button>
                      </div>
                      <div className="flex gap-2 text-xs flex-wrap">
                        <Badge variant="secondary">
                          {t('searchPage.strategy')}: {resolveModelName(customModels?.strategy || modelDefaults?.default_chat_model)}
                        </Badge>
                        <Badge variant="secondary">
                          {t('searchPage.answer')}: {resolveModelName(customModels?.answer || modelDefaults?.default_chat_model)}
                        </Badge>
                        <Badge variant="secondary">
                          {t('searchPage.final')}: {resolveModelName(customModels?.finalAnswer || modelDefaults?.default_chat_model)}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        onClick={handleAsk}
                        disabled={ask.isStreaming || !askQuestion.trim()}
                        className="w-full"
                      >
                        {ask.isStreaming ? (
                          <>
                            <InlineSkeleton className="mr-2" />
                            {t('searchPage.processing')}
                          </>
                        ) : (
                          t('searchPage.ask')
                        )}
                      </Button>

                      {ask.finalAnswer && (
                        <Button
                          variant="outline"
                          onClick={() => setShowSaveDialog(true)}
                          className="w-full"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {t('searchPage.saveToProjects')}
                        </Button>
                      )}
                      {ask.finalAnswer && ask.queryRunId && projectId && projectId !== 'all' && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            window.location.href = `/projects/${encodeURIComponent(projectId)}/graph?run=${encodeURIComponent(ask.queryRunId!)}`
                          }}
                        >
                          {t('knowledge.graphViewRetrieval')}
                        </Button>
                      )}
                    </div>
                  </>
                )}

                {/* Streaming Response */}
                <StreamingResponse
                  isStreaming={ask.isStreaming}
                  streamStatus={ask.streamStatus}
                  activityLog={ask.activityLog}
                  strategy={ask.strategy}
                  answers={ask.answers}
                  finalAnswer={ask.finalAnswer}
                />

                {/* Advanced Models Dialog */}
                <AdvancedModelsDialog
                  open={showAdvancedModels}
                  onOpenChange={setShowAdvancedModels}
                  defaultModels={{
                    strategy: customModels?.strategy || modelDefaults?.default_chat_model || '',
                    answer: customModels?.answer || modelDefaults?.default_chat_model || '',
                    finalAnswer: customModels?.finalAnswer || modelDefaults?.default_chat_model || ''
                  }}
                  onSave={setCustomModels}
                />

                {/* Save to Notebooks Dialog */}
                {ask.finalAnswer && (
                  <SaveToProjectsDialog
                    open={showSaveDialog}
                    onOpenChange={setShowSaveDialog}
                    question={askQuestion}
                    answer={ask.finalAnswer}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>{t('searchPage.search')}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('searchPage.searchDesc')}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Search Input */}
                <div className="space-y-2">
                  <Label htmlFor="search-query" className="sr-only">
                    {t('searchPage.search')}
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      id="search-query"
                      name="search-query"
                      placeholder={t('searchPage.enterSearchPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={handleKeyPress}
                      disabled={searchMutation.isPending}
                      className="flex-1"
                      aria-label={t('common.accessibility.enterSearch')}
                      autoComplete="off"
                    />
                    <Button
                      onClick={handleSearch}
                      disabled={searchMutation.isPending || !searchQuery.trim()}
                      aria-label={t('common.accessibility.searchKBBtn')}
                      className="w-full sm:w-auto"
                    >
                      {searchMutation.isPending ? (
                        <SearchButtonSkeleton />
                      ) : (
                        <Search className="h-4 w-4 mr-2" />
                      )}
                      {t('searchPage.search')}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('searchPage.pressToSearch')}</p>
                </div>

                {/* Search Options */}
                <div className="space-y-3">
                  {/* Search Type */}
                  <div className="space-y-2" role="group" aria-labelledby="search-type-label">
                    <span id="search-type-label" className="text-sm font-medium leading-none">{t('searchPage.searchType')}</span>
                    {!hasEmbeddingModel && (
                      <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500">
                        <AlertCircle className="h-4 w-4" />
                        <span>{t('searchPage.vectorSearchWarning')}</span>
                      </div>
                    )}
                    <RadioGroup
                      name="search-type"
                      value={searchType}
                      onValueChange={(value: 'text' | 'vector' | 'hybrid') => setSearchType(value)}
                      disabled={modelsLoading || searchMutation.isPending}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="text" id="text" />
                        <Label htmlFor="text" className="font-normal cursor-pointer">
                          {t('searchPage.textSearch')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="vector"
                          id="vector"
                          disabled={!hasEmbeddingModel || searchMutation.isPending}
                        />
                        <Label
                          htmlFor="vector"
                          className={`font-normal ${!hasEmbeddingModel ? 'text-muted-foreground cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {t('searchPage.vectorSearch')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="hybrid"
                          id="hybrid"
                          disabled={!hasEmbeddingModel || searchMutation.isPending}
                        />
                        <Label
                          htmlFor="hybrid"
                          className={`font-normal ${!hasEmbeddingModel ? 'text-muted-foreground cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {t('searchPage.hybridSearch')}
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="search-project">{t('searchPage.projectScope')}</Label>
                    <Select
                      value={projectId}
                      onValueChange={setProjectId}
                      disabled={searchMutation.isPending}
                    >
                      <SelectTrigger id="search-project">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('searchPage.allProjects')}</SelectItem>
                        {(projects ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Search Locations */}
                  <div className="space-y-2" role="group" aria-labelledby="search-in-label">
                    <span id="search-in-label" className="text-sm font-medium leading-none">{t('searchPage.searchIn')}</span>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="sources"
                          name="sources"
                          checked={searchSources}
                          onCheckedChange={(checked) => setSearchSources(checked as boolean)}
                          disabled={searchMutation.isPending}
                        />
                        <Label htmlFor="sources" className="font-normal cursor-pointer">
                          {t('searchPage.searchSources')}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="notes"
                          name="notes"
                          checked={searchNotes}
                          onCheckedChange={(checked) => setSearchNotes(checked as boolean)}
                          disabled={searchMutation.isPending}
                        />
                        <Label htmlFor="notes" className="font-normal cursor-pointer">
                          {t('searchPage.searchNotes')}
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Search Results */}
                {searchMutation.data && (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">
                        {t('searchPage.resultsFound').replace('{count}', searchMutation.data.total_count.toString())}
                      </h3>
                      <Badge variant="outline">{searchMutation.data.search_type === 'text' ? t('searchPage.textSearch') : t('searchPage.vectorSearch')}</Badge>
                    </div>

                    {searchMutation.data.results.length === 0 ? (
                      <Card>
                        <CardContent className="pt-6">
                          <EmptyState
                            variant="subtle"
                            title={t('searchPage.noResultsFor').replace('{query}', searchQuery)}
                          />
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {searchMutation.data.results.map((result, index) => {
                          // Parse type from parent_id (format: "source:id" or "note:id")
                          // Handle null parent_id gracefully (orphaned records)
                          if (!result.parent_id) {
                            console.warn('Search result with null parent_id:', result)
                            return null
                          }
                          const [type, id] = result.parent_id.split(':')
                          if (type !== 'source' && type !== 'note') {
                            return null
                          }

                          return (
                          <Card key={index}>
                            <CardContent className="pt-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <button
                                    onClick={() => openModal(type as 'source' | 'note', id)}
                                    className="text-primary hover:underline font-medium"
                                  >
                                    {result.title}
                                  </button>
                                  <Badge variant="secondary" className="ml-2">
                                    {result.final_score.toFixed(2)}
                                  </Badge>
                                </div>
                              </div>

                              {result.matches && result.matches.length > 0 && (
                                <Collapsible className="mt-3">
                                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                                    <ChevronDown className="h-4 w-4" />
                                    {t('searchPage.matches').replace('{count}', result.matches.length.toString())}
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="mt-2 space-y-1">
                                    {result.matches.map((match, i) => (
                                      <div key={i} className="text-sm pl-6 py-1 border-l-2 border-muted">
                                        {match}
                                      </div>
                                    ))}
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                            </CardContent>
                          </Card>
                        )})}
                      </div>
                    )}

                    {searchMutation.data.results.length > 0 &&
                    searchMutation.data.total_count > searchMutation.data.results.length ? (
                      <div className="flex justify-center pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleLoadMoreResults}
                          disabled={searchMutation.isPending}
                        >
                          {searchMutation.isPending ? (
                            <>
                              <InlineSkeleton className="mr-2" />
                              <span>{t('sources.loadingMore')}</span>
                            </>
                          ) : (
                            t('sources.loadingMore')
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </div>
      </div>
  )
}
