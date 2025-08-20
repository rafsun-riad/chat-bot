from haystack import Document, Pipeline
from haystack.components.builders import PromptBuilder
from haystack.components.embedders import (
    SentenceTransformersDocumentEmbedder,
    SentenceTransformersTextEmbedder,
)
from haystack.components.generators import HuggingFaceLocalGenerator
from haystack.components.preprocessors import DocumentSplitter
from haystack.components.retrievers import InMemoryEmbeddingRetriever
from haystack.core.component import Component
from haystack.document_stores.in_memory import InMemoryDocumentStore

# Initialize document store
document_store = InMemoryDocumentStore()

# Initialize indexing pipeline components
text_splitter = DocumentSplitter(
    split_by="sentence",  # Split by sentences for natural chunks
    split_length=3,  # Slightly larger chunks for better context
    split_overlap=1,  # Maintain overlap for context continuity
)

document_embedder = SentenceTransformersDocumentEmbedder(
    model="sentence-transformers/all-MiniLM-L6-v2"
)

# Initialize RAG pipeline components
retriever = InMemoryEmbeddingRetriever(document_store=document_store)

query_embedder = SentenceTransformersTextEmbedder(
    model="sentence-transformers/all-MiniLM-L6-v2"
)

prompt_builder = PromptBuilder(
    template="""Given the following context, answer the question. Only use information from the provided context. Be specific and cite the relevant information from the context. If the answer cannot be found in the context, say "I cannot answer this based on the provided documents."

Context:
{% for doc in documents %}
- {{ doc.content }}
{% endfor %}

Question: {{ question }}

Think step by step:
1. Identify relevant information in the context
2. Form a clear and direct answer
3. Only include facts mentioned in the context

Answer:""",
    required_variables=[
        "documents",
        "question",
    ],  # Explicitly mark both variables as required
)

generator = HuggingFaceLocalGenerator(
    model="google/flan-t5-small",  # Small but effective model for CPU
    task="text2text-generation",  # Specify the task type
    generation_kwargs={  # Generation parameters
        "max_new_tokens": 200,  # Allow longer responses for more complete answers
        "temperature": 0.1,  # Very low temperature for more deterministic answers
        "top_k": 30,  # More focused vocabulary selection
        "top_p": 0.9,  # Nucleus sampling for better quality
        "repetition_penalty": 1.2,  # Stronger repetition avoidance
        "do_sample": True,  # Enable sampling for natural responses
        "num_beams": 2,  # Simple beam search for better coherence
    },
)

# Custom component to join document texts


class JoinDocumentsToPrompt(Component):
    def __init__(self, separator="\n\n"):
        super().__init__()
        self.separator = separator

    def run(self, documents):
        # Join all document texts into a single string
        prompt = self.separator.join([doc.content for doc in documents])
        return {"prompt": prompt}


# Build indexing pipeline
indexing_pipeline = Pipeline()
indexing_pipeline.add_component("splitter", text_splitter)
indexing_pipeline.add_component("embedder", document_embedder)
indexing_pipeline.connect("splitter.documents", "embedder.documents")

# Build the RAG pipeline
rag_pipeline = Pipeline()
rag_pipeline.add_component("query_embedder", query_embedder)
rag_pipeline.add_component("retriever", retriever)
rag_pipeline.add_component("prompt_builder", prompt_builder)
rag_pipeline.add_component("llm", generator)

# Connect RAG pipeline components
rag_pipeline.connect("query_embedder.embedding", "retriever.query_embedding")
rag_pipeline.connect("retriever.documents", "prompt_builder.documents")
rag_pipeline.connect("prompt_builder.prompt", "llm.prompt")


def is_document_store_empty() -> bool:
    """Check if the document store is empty

    Returns:
        bool: True if the document store is empty, False otherwise
    """
    return document_store.count_documents() == 0


def clear_documents() -> None:
    """Clear all documents from the document store"""
    # filter_={} means all documents
    document_store.delete_documents(filter_={})
    print("[DEBUG] Cleared all documents from store")


def add_documents(texts: str | list[str]) -> None:
    """Add and index documents to the retrieval store.

    Args:
        texts: A single text string or a list of text strings to index
    """
    if isinstance(texts, str):
        texts = [texts]

    for text in texts:
        # Create document
        document = Document(content=text)

        # Run indexing pipeline
        result = indexing_pipeline.run({"splitter": {"documents": [document]}})
        chunks = result["embedder"]["documents"]

        # Save to store
        document_store.write_documents(chunks)
        print(f"[DEBUG] Added {len(chunks)} chunks to document store")


def ask_question(question: str) -> str:
    """Ask a question and get an answer using RAG"""
    if document_store.count_documents() == 0:
        return "Please add some documents first."

    # Run RAG pipeline
    result = rag_pipeline.run(
        {
            "query_embedder": {"text": question},
            "prompt_builder": {"question": question},
            "retriever": {"top_k": 5},  # Get more documents for better context
        }
    )

    # Print debug information to see the structure
    print(f"[DEBUG] Pipeline result structure: {result}")

    try:
        # First try the 'generated_text' field
        answer = result["llm"]["generated_text"]
    except (KeyError, TypeError):
        try:
            # Then try the 'replies' field
            answer = result["llm"]["replies"][0]
        except (KeyError, TypeError):
            try:
                # Finally try the 'text' field
                answer = result["llm"]["text"][0]
            except (KeyError, TypeError):
                print(f"[DEBUG] Unexpected result structure: {result}")
                return "Sorry, I encountered an error while generating the answer."

    return f"Answer: {answer}"


def warmup() -> None:
    """Warmup the pipeline with a sample document and question"""
    sample = """
    Cows are herbivorous mammals that primarily eat grass, hay, and grains.
    They can be found on farms worldwide and are raised for milk, meat, and leather.
    Cows have a unique digestive system with four stomach compartments.
    """
    add_documents(sample)
    print(ask_question("What do cows eat?"))
    print(ask_question("Where can you find cows?"))


if __name__ == "__main__":
    warmup()
