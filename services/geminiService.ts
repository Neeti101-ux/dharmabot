import { GoogleGenerativeAI } from '@google/genai';
import { QueryPayload, AIResponse, GroundingChunk } from '../types';
import { GEMINI_TEXT_MODEL } from '../constants';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY;

if (!API_KEY) {
  console.error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY environment variable.');
}

const genAI = new GoogleGenerativeAI(API_KEY);

const SYSTEM_INSTRUCTION = `You are Dharmabot, an expert AI legal assistant specializing in Indian law and legal practice. You provide accurate, helpful, and professional legal guidance while maintaining ethical standards.

Core Capabilities:
- Comprehensive knowledge of Indian legal system, laws, and procedures
- Document analysis and legal research assistance
- Professional legal writing and document drafting
- Case law analysis and precedent research
- Regulatory compliance guidance

Response Guidelines:
- Provide accurate, well-researched legal information
- Use clear, professional language appropriate for legal context
- Include relevant legal citations and references when applicable
- Acknowledge limitations and recommend professional consultation when necessary
- Maintain confidentiality and professional ethics
- Structure responses logically with clear headings and bullet points when helpful

Legal Disclaimer: Always remind users that AI assistance does not constitute legal advice and professional legal consultation is recommended for specific legal matters.

Focus Areas:
- Indian Constitution and fundamental rights
- Civil and criminal law procedures
- Corporate and commercial law
- Family law and personal matters
- Property and real estate law
- Labor and employment law
- Tax and regulatory compliance
- Intellectual property rights
- Consumer protection laws
- Environmental and administrative law`;

export const getAIResponse = async (payload: QueryPayload): Promise<AIResponse> => {
  if (!API_KEY) {
    throw new Error('Gemini API key is not configured');
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_TEXT_MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192,
      }
    });

    // Build the prompt with context
    let prompt = payload.userQuery;

    // Add chat history context if available
    if (payload.chatHistory && payload.chatHistory.length > 0) {
      const recentHistory = payload.chatHistory.slice(-6); // Last 6 messages for context
      const historyContext = recentHistory.map(msg => {
        if (msg.role === 'user') {
          return `User: ${msg.queryText}`;
        } else if (msg.role === 'ai') {
          return `Assistant: ${msg.text.substring(0, 200)}...`;
        }
        return '';
      }).filter(Boolean).join('\n');
      
      if (historyContext) {
        prompt = `Previous conversation context:\n${historyContext}\n\nCurrent question: ${payload.userQuery}`;
      }
    }

    // Add document context if available
    if (payload.documents && payload.documents.length > 0) {
      const documentContext = payload.documents.map(doc => {
        if (doc.textContent) {
          return `Document: ${doc.name}\nContent: ${doc.textContent.substring(0, 2000)}...`;
        }
        return `Document: ${doc.name} (image/binary content)`;
      }).join('\n\n');
      
      prompt += `\n\nRelevant documents:\n${documentContext}`;
    }

    // Prepare content parts for the request
    const parts: any[] = [{ text: prompt }];

    // Add image content if available
    if (payload.documents) {
      for (const doc of payload.documents) {
        if (doc.imagePageDataUrls && doc.imagePageDataUrls.length > 0) {
          for (const imageDataUrl of doc.imagePageDataUrls) {
            if (imageDataUrl.startsWith('data:image/')) {
              const base64Data = imageDataUrl.split(',')[1];
              const mimeType = imageDataUrl.split(';')[0].split(':')[1];
              parts.push({
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              });
            }
          }
        }
      }
    }

    let result;
    let sources: GroundingChunk[] = [];

    // Use search grounding if web search is enabled
    if (payload.enableGoogleSearch) {
      try {
        const modelWithGrounding = genAI.getGenerativeModel({
          model: GEMINI_TEXT_MODEL,
          systemInstruction: SYSTEM_INSTRUCTION,
          generationConfig: {
            temperature: 0.7,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 8192,
          },
          tools: [{
            googleSearchRetrieval: {
              dynamicRetrievalConfig: {
                mode: "MODE_DYNAMIC",
                dynamicThreshold: 0.7
              }
            }
          }]
        });

        result = await modelWithGrounding.generateContent(parts);
        
        // Extract grounding metadata if available
        if (result.response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
          sources = result.response.candidates[0].groundingMetadata.groundingChunks
            .filter((chunk: any) => chunk.web)
            .map((chunk: any) => ({
              web: {
                uri: chunk.web.uri,
                title: chunk.web.title || chunk.web.uri
              }
            }));
        }
      } catch (groundingError) {
        console.warn('Grounding search failed, falling back to regular generation:', groundingError);
        result = await model.generateContent(parts);
      }
    } else {
      result = await model.generateContent(parts);
    }

    const response = await result.response;
    const text = response.text();

    if (!text) {
      throw new Error('Empty response from Gemini API');
    }

    return {
      text,
      sources,
      rawResponse: response
    };

  } catch (error) {
    console.error('Gemini API Error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        throw new Error('Invalid API key. Please check your Gemini API configuration.');
      } else if (error.message.includes('quota')) {
        throw new Error('API quota exceeded. Please try again later.');
      } else if (error.message.includes('safety')) {
        throw new Error('Content was blocked by safety filters. Please rephrase your query.');
      } else {
        throw new Error(`AI service error: ${error.message}`);
      }
    }
    
    throw new Error('Unknown error occurred while processing your request.');
  }
};

export const generateDocumentDraftFromInstruction = async (instruction: string): Promise<AIResponse> => {
  if (!API_KEY) {
    throw new Error('Gemini API key is not configured');
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_TEXT_MODEL,
      systemInstruction: `You are a specialized legal document drafting assistant for Indian law. Your task is to generate professional, legally sound documents based on user instructions.

Guidelines for document generation:
- Create comprehensive, well-structured legal documents
- Use appropriate legal language and terminology for Indian law
- Include all necessary clauses and provisions
- Follow standard legal document formatting
- Ensure compliance with relevant Indian laws and regulations
- Include proper legal disclaimers where appropriate
- Structure documents with clear headings and sections
- Use markdown formatting for better readability

Document Structure:
- Start with an appropriate title
- Include parties, definitions, and recitals as needed
- Organize content with clear headings and numbered clauses
- End with execution clauses and signature blocks
- Add legal disclaimers and governing law clauses

Always generate complete, professional documents that could serve as starting points for legal practice, while noting that professional legal review is recommended.`,
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192,
      }
    });

    const prompt = `Please draft a legal document based on the following instructions. Ensure the document is comprehensive, professionally formatted, and compliant with Indian law:

${instruction}

Please format the response in markdown for better readability, with appropriate headings, sections, and legal structure.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text) {
      throw new Error('Empty response from Gemini API');
    }

    // Extract title from the generated content if possible
    const lines = text.split('\n');
    const titleLine = lines.find(line => line.startsWith('#') || line.toUpperCase() === line && line.length > 10);
    const suggestedTitle = titleLine ? titleLine.replace(/^#+\s*/, '').trim() : undefined;

    return {
      text,
      suggestedTitle,
      rawResponse: response
    };

  } catch (error) {
    console.error('Document generation error:', error);
    
    if (error instanceof Error) {
      return {
        text: `Error: ${error.message}`,
        rawResponse: null
      };
    }
    
    return {
      text: 'Error: Unknown error occurred during document generation.',
      rawResponse: null
    };
  }
};

export const transcribeAudioWithGemini = async (base64AudioData: string, mimeType: string): Promise<AIResponse> => {
  if (!API_KEY) {
    throw new Error('Gemini API key is not configured');
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_TEXT_MODEL,
      systemInstruction: `You are an expert audio transcription assistant. Your task is to accurately transcribe audio content to text.

Guidelines:
- Provide accurate, word-for-word transcription
- Maintain proper punctuation and capitalization
- Preserve the natural flow and structure of speech
- Do not add interpretations or summaries
- If audio is unclear, indicate with [unclear] markers
- Maintain speaker context if multiple speakers are present`,
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192,
      }
    });

    const prompt = "Please transcribe this audio accurately to text. Provide only the transcription without additional commentary.";

    const parts = [
      { text: prompt },
      {
        inlineData: {
          data: base64AudioData,
          mimeType: mimeType
        }
      }
    ];

    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = response.text();

    if (!text) {
      throw new Error('Empty transcription response');
    }

    return {
      text: text.trim(),
      rawResponse: response
    };

  } catch (error) {
    console.error('Audio transcription error:', error);
    
    if (error instanceof Error) {
      return {
        text: `Error: Failed to transcribe audio - ${error.message}`,
        rawResponse: null
      };
    }
    
    return {
      text: 'Error: Unknown error occurred during audio transcription.',
      rawResponse: null
    };
  }
};

export const polishLegalNoteWithGemini = async (rawTranscript: string): Promise<AIResponse> => {
  if (!API_KEY) {
    throw new Error('Gemini API key is not configured');
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_TEXT_MODEL,
      systemInstruction: `You are a legal writing assistant specializing in transforming raw transcripts into polished, professional legal notes.

Your task is to:
- Clean up grammar, punctuation, and sentence structure
- Organize content into logical sections with clear headings
- Maintain all factual information and legal details
- Use professional legal language while keeping content accessible
- Structure the note with appropriate formatting
- Add relevant legal context where helpful
- Preserve the original meaning and intent

Format the output in markdown with:
- Clear headings and subheadings
- Bullet points for lists and key points
- Proper paragraph structure
- Professional legal terminology

Do not add information not present in the original transcript.`,
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192,
      }
    });

    const prompt = `Please transform this raw transcript into a polished, professional legal note. Maintain all factual information while improving structure, grammar, and professional presentation:

${rawTranscript}

Format the response in markdown with clear headings and professional structure.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text) {
      throw new Error('Empty response from note polishing');
    }

    // Extract a suggested title from the polished content
    const lines = text.split('\n');
    const titleLine = lines.find(line => line.startsWith('#') && !line.startsWith('##'));
    const suggestedTitle = titleLine ? titleLine.replace(/^#+\s*/, '').trim() : undefined;

    return {
      text,
      suggestedTitle,
      rawResponse: response
    };

  } catch (error) {
    console.error('Note polishing error:', error);
    
    if (error instanceof Error) {
      return {
        text: `Error: Failed to polish note - ${error.message}`,
        rawResponse: null
      };
    }
    
    return {
      text: 'Error: Unknown error occurred during note polishing.',
      rawResponse: null
    };
  }
};

export const analyzeConsultationTranscript = async (transcript: string): Promise<AIResponse> => {
  if (!API_KEY) {
    throw new Error('Gemini API key is not configured');
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_TEXT_MODEL,
      systemInstruction: `You are a legal analysis assistant specializing in analyzing consultation transcripts to extract key legal insights.

Your task is to analyze the consultation transcript and provide:
1. A brief summary of the consultation
2. Key legal issues identified
3. Possible legal remedies or solutions
4. Suggested follow-up actions

Format your response in markdown with these exact headings:
## Brief Summary
## Key Legal Issues
## Possible Legal Remedies  
## Suggested Follow-up Actions

Use bullet points under each section for clarity. Focus on actionable legal insights while maintaining professional objectivity.`,
      generationConfig: {
        temperature: 0.4,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 4096,
      },
      tools: [{
        googleSearchRetrieval: {
          dynamicRetrievalConfig: {
            mode: "MODE_DYNAMIC",
            dynamicThreshold: 0.7
          }
        }
      }]
    });

    const prompt = `Please analyze this legal consultation transcript and provide structured insights:

${transcript}

Provide a comprehensive analysis with brief summary, key legal issues, possible remedies, and follow-up actions.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text) {
      throw new Error('Empty response from consultation analysis');
    }

    // Extract grounding sources if available
    let sources: GroundingChunk[] = [];
    if (result.response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      sources = result.response.candidates[0].groundingMetadata.groundingChunks
        .filter((chunk: any) => chunk.web)
        .map((chunk: any) => ({
          web: {
            uri: chunk.web.uri,
            title: chunk.web.title || chunk.web.uri
          }
        }));
    }

    return {
      text,
      sources,
      rawResponse: response
    };

  } catch (error) {
    console.error('Consultation analysis error:', error);
    
    if (error instanceof Error) {
      return {
        text: `Error: Failed to analyze consultation - ${error.message}`,
        rawResponse: null
      };
    }
    
    return {
      text: 'Error: Unknown error occurred during consultation analysis.',
      rawResponse: null
    };
  }
};

export const performDeepResearch = async (query: string): Promise<AIResponse> => {
  if (!API_KEY) {
    throw new Error('Gemini API key is not configured');
  }

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_TEXT_MODEL,
      systemInstruction: `You are a specialized legal research assistant with expertise in Indian law. Your task is to conduct comprehensive legal research and provide detailed, well-structured analysis.

Research Guidelines:
- Provide thorough, accurate legal research
- Include relevant case law, statutes, and regulations
- Structure responses with clear headings and sections
- Use professional legal language
- Include practical implications and applications
- Cite relevant legal authorities and precedents
- Provide current and up-to-date legal information
- Format responses in markdown for better readability

Research Structure:
- Executive Summary
- Legal Framework and Applicable Laws
- Case Law Analysis
- Current Legal Position
- Practical Implications
- Recommendations and Next Steps

Always provide comprehensive, professional research that would be valuable for legal practitioners.`,
      generationConfig: {
        temperature: 0.4,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192,
      },
      tools: [{
        googleSearchRetrieval: {
          dynamicRetrievalConfig: {
            mode: "MODE_DYNAMIC",
            dynamicThreshold: 0.7
          }
        }
      }]
    });

    const prompt = `Conduct comprehensive legal research on the following topic. Provide detailed analysis with current legal position, relevant case law, and practical implications:

${query}

Please structure your response with clear headings and provide thorough legal analysis with citations and sources.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text) {
      throw new Error('Empty response from research query');
    }

    // Extract grounding sources
    let sources: GroundingChunk[] = [];
    if (result.response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      sources = result.response.candidates[0].groundingMetadata.groundingChunks
        .filter((chunk: any) => chunk.web)
        .map((chunk: any) => ({
          web: {
            uri: chunk.web.uri,
            title: chunk.web.title || chunk.web.uri
          }
        }));
    }

    return {
      text,
      sources,
      rawResponse: response
    };

  } catch (error) {
    console.error('Deep research error:', error);
    
    if (error instanceof Error) {
      return {
        text: `Error: Failed to perform research - ${error.message}`,
        sources: [],
        rawResponse: null
      };
    }
    
    return {
      text: 'Error: Unknown error occurred during research.',
      sources: [],
      rawResponse: null
    };
  }
};