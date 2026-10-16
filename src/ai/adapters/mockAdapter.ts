/**
 * SocietyFix AI — Deterministic Testing / Local Fixture AI Adapter
 * Implements AIGatewayPort with deterministic responses for tests and environments without live GenAI keys.
 */

import type {
  AIGatewayPort,
  TextGenerationRequest,
  StructuredGenerationRequest,
  EmbeddingRequest,
  TranscriptionRequest,
  GenerationResult,
  TranscriptionResult,
  ExtractedMeetingMinutes,
  ExtractedVoiceComplaint,
  SocietyMemoryAnswer,
} from '../aiGatewayTypes.ts';

export class MockAIAdapter implements AIGatewayPort {
  async generateText(request: TextGenerationRequest): Promise<GenerationResult<string>> {
    const start = Date.now();
    const promptSnippet = request.userPrompt.slice(0, 50);
    const text = `[Mock AI Response for ${request.operationName}]: Synthesized outcome for: ${promptSnippet}`;

    return {
      data: text,
      rawText: text,
      model: 'mock-gemma-2-9b',
      provider: 'mock',
      promptTokens: 45,
      completionTokens: 25,
      latencyMs: Date.now() - start + 2,
      cached: false,
    };
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<GenerationResult<T>> {
    const start = Date.now();
    let mockData: unknown;

    if (request.schemaName === 'ExtractedMeetingMinutes' || request.operationName.includes('meeting')) {
      const minutes: ExtractedMeetingMinutes = {
        meetingTitle: 'Annual General Body Meeting (AGM) 2024',
        executiveSummary: 'Reviewed society audited accounts, approved rooftop solar PV installation, and mandated digital maintenance payment adoption.',
        keyDiscussions: [
          {
            topic: 'Rooftop Solar PV Installation',
            summary: 'Discussed vendor bids from Tata Power and Loom Solar for 25kW capacity system with 3.5 year payback.',
            sentiment: 'CONSENSUS',
          },
          {
            topic: 'Penalty on Balcony Water Dripping & Hanging Plants',
            summary: 'Several residents reported dripping water from A-Wing balconies damaging lower floor facades and AC outdoor units.',
            sentiment: 'CONFLICT_RESOLVED',
          },
        ],
        resolutions: [
          {
            title: 'Approval of 25kW Solar Energy System',
            description: 'Resolved to award 25kW grid-connected rooftop solar installation contract to Tata Power Solar at INR 12,50,000.',
            recommendedStatus: 'PASSED_UNANIMOUSLY',
            isStatutory: true,
            agendaItemRef: 'Item 4.1',
          },
          {
            title: 'Mandatory Fixed Penalty for Balcony Dripping',
            description: 'Resolved that a penalty of INR 500 shall be levied on any resident unit after one written warning for balcony dripping.',
            recommendedStatus: 'PASSED_MAJORITY',
            isStatutory: false,
            agendaItemRef: 'Item 6.3',
          },
        ],
        actionItems: [
          {
            title: 'Sign Agreement with Tata Power Solar',
            description: 'Execute tripartite net-metering contract and vendor agreement for solar panels.',
            suggestedAssigneeName: 'Hon. Secretary',
            suggestedRole: 'HON_SECRETARY',
            priority: 'HIGH',
            suggestedDeadlineDays: 14,
            estimatedCostPaise: 125000000,
            dependencies: [],
          },
          {
            title: 'Issue Circular on Balcony Water Drainage & Penalties',
            description: 'Draft and distribute warning circular regarding INR 500 penalty and designated drainage pipes.',
            suggestedAssigneeName: 'Estate Manager',
            suggestedRole: 'ESTATE_MANAGER',
            priority: 'MEDIUM',
            suggestedDeadlineDays: 7,
            dependencies: [],
          },
        ],
        openQuestionsForNextMeeting: [
          'Review of lift modernization vendor tender responses.',
        ],
      };
      mockData = minutes;
    } else if (request.schemaName === 'ExtractedVoiceComplaint' || request.operationName.includes('complaint')) {
      const complaint: ExtractedVoiceComplaint = {
        category: 'WATER_LEAKAGE',
        urgency: 'URGENT',
        flatNumberMentioned: 'B-402',
        locationDescription: 'Common pipe shaft between 3rd and 4th floor B-Wing',
        summaryInEnglish: 'Heavy seepage reported from the main vertical rainwater pipe into flat B-402 ceiling during continuous rain.',
        originalLanguageTranscript: 'B-402 madhe ceiling varun paani padat ahe, pipe leak ahe lakar bagha.',
      };
      mockData = complaint;
    } else if (request.schemaName === 'SocietyMemoryAnswer' || request.operationName.includes('memory')) {
      // Grounded answering check: if retrievedContext exists and is non-empty, synthesize from context; otherwise indicate no records
      const hasContext = request.retrievedContext && request.retrievedContext.length > 0;
      
      if (!hasContext) {
        const noAnswer: SocietyMemoryAnswer = {
          answer: 'The society records and approved documents currently available do not contain information answering your inquiry. Please consult the managing committee.',
          groundedInContext: false,
          confidence: 0.1,
          citations: [],
          suggestedFollowUps: ['Contact the Hon. Secretary', 'Raise this query in the next Committee Meeting'],
        };
        mockData = noAnswer;
      } else {
        const firstSnippet = request.retrievedContext![0] || '';
        const docIdMatch = firstSnippet.match(/\[DOCUMENT ID:\s*([^\]]+)\]/);
        const titleMatch = firstSnippet.match(/TITLE:\s*([^\n]+)/);
        const refMatch = firstSnippet.match(/REFERENCE:\s*([^\n]+)/);
        const contentMatch = firstSnippet.match(/CONTENT:\s*([\s\S]+)/);

        const docId = docIdMatch ? docIdMatch[1]!.trim() : 'doc-mock-001';
        const docTitle = titleMatch ? titleMatch[1]!.trim() : 'Society Bye-Laws & Code of Conduct 2024';
        const docRef = refMatch ? refMatch[1]!.trim() : 'Section 14(b)';
        const docExcerpt = contentMatch ? contentMatch[1]!.trim().slice(0, 150) : firstSnippet.slice(0, 150);

        const answer: SocietyMemoryAnswer = {
          answer: `According to the housing society documents on record (${docTitle}): ${docExcerpt.slice(0, 200)}`,
          groundedInContext: true,
          confidence: 0.94,
          citations: [
            {
              documentId: docId,
              title: docTitle,
              sourceReference: docRef,
              relevantExcerpt: docExcerpt,
              relevanceScore: 0.96,
            },
          ],
          suggestedFollowUps: [
            'How do I report a violation?',
            'What is the procedure for committee dispute review?',
          ],
        };
        mockData = answer;
      }
    } else {
      // Generic structured fallback
      mockData = {
        message: 'Mock structured output generated',
        operation: request.operationName,
        timestamp: new Date().toISOString(),
      };
    }

    // Verify against schema
    const validated = request.schema.parse(mockData);

    return {
      data: validated,
      rawText: JSON.stringify(validated),
      model: 'mock-gemma-2-9b',
      provider: 'mock',
      promptTokens: 120,
      completionTokens: 85,
      latencyMs: Date.now() - start + 5,
      cached: false,
    };
  }

  async embedText(request: EmbeddingRequest): Promise<number[][]> {
    // Generate deterministic 32-dimensional mock unit vectors with independent dimension hashing
    return request.texts.map(text => {
      const vec: number[] = new Array(32).fill(0);
      for (let i = 0; i < 32; i++) {
        let hash = 0;
        for (let j = 0; j < text.length; j++) {
          hash = (hash * 31 + text.charCodeAt(j) * (i + 1)) | 0;
        }
        vec[i] = ((hash % 1000) / 1000);
      }
      const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0)) || 1;
      return vec.map(v => v / norm);
    });
  }

  async transcribeSpeech(request: TranscriptionRequest): Promise<TranscriptionResult> {
    return {
      transcript: 'Namaskar, amchya flat B-402 madhe pipe leakage chi problem ahe, krupaya maintenance team la pathva.',
      detectedLanguage: request.languageHint || 'mr-IN',
      confidence: 0.95,
      durationSeconds: 6.2,
    };
  }
}
