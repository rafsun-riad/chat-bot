from haystack import Document, Pipeline
from haystack.components.embedders import (
    SentenceTransformersDocumentEmbedder,
    SentenceTransformersTextEmbedder,
)
from haystack.components.preprocessors import DocumentSplitter
from haystack.components.readers import ExtractiveReader
from haystack.components.retrievers import InMemoryEmbeddingRetriever
from haystack.components.writers import DocumentWriter
from haystack.document_stores.in_memory import InMemoryDocumentStore

# Initialize document store
document_store = InMemoryDocumentStore()

# Indexing pipeline components
splitter = DocumentSplitter(split_by="sentence", split_length=10)
doc_embedder = SentenceTransformersDocumentEmbedder(
    model="sentence-transformers/all-MiniLM-L6-v2"
)
writer = DocumentWriter(document_store=document_store)

# Build indexing pipeline
indexing_pipeline = Pipeline()
indexing_pipeline.add_component("splitter", splitter)
indexing_pipeline.add_component("embedder", doc_embedder)
indexing_pipeline.add_component("writer", writer)
indexing_pipeline.connect("splitter", "embedder")
indexing_pipeline.connect("embedder", "writer")

# Query pipeline components
query_embedder = SentenceTransformersTextEmbedder(
    model="sentence-transformers/all-MiniLM-L6-v2"
)
retriever = InMemoryEmbeddingRetriever(document_store=document_store)
reader = ExtractiveReader(model="deepset/roberta-base-squad2")

# Build query pipeline
query_pipeline = Pipeline()
query_pipeline.add_component("query_embedder", query_embedder)
query_pipeline.add_component("retriever", retriever)
query_pipeline.add_component("reader", reader)
query_pipeline.connect("query_embedder.embedding", "retriever.query_embedding")
query_pipeline.connect("retriever", "reader.documents")


# Document indexer
def add_documents(raw_text: str):
    document_store.delete_documents(document_ids=[])  # Clear all previous docs
    doc = Document(content=raw_text)

    indexing_pipeline.run({"splitter": {"documents": [doc]}})


# Clear all documents from the store
def clear_documents():
    try:
        # Get all document IDs first
        docs = document_store.filter_documents()
        if docs:
            doc_ids = [doc.id for doc in docs]
            document_store.delete_documents(document_ids=doc_ids)
            print(f"[DEBUG] Document store cleared. Deleted {len(doc_ids)} documents.")
        else:
            print("[DEBUG] Document store was already empty.")
    except Exception as e:
        print(f"[DEBUG] Error clearing documents: {e}")


# Check if document store is empty
def is_document_store_empty():
    try:
        # Try to get documents, if it raises an exception or returns empty, store is empty
        docs = document_store.filter_documents()
        is_empty = len(docs) == 0

        return is_empty
    except Exception as e:
        print(f"[DEBUG] Error checking document store: {e}")
        return True


# Answer questions
def ask_question(question: str) -> str:
    # Check if document store is empty
    if is_document_store_empty():
        return "Please upload a document or website first."

    result = query_pipeline.run(
        {
            "query_embedder": {"text": question},
            "retriever": {"top_k": 5},
            "reader": {"query": question, "top_k": 1},
        }
    )
    answers = result["reader"]["answers"]

    if not answers or not answers[0].data:
        return "Sorry, I couldn't find an answer."
    answer = answers[0].data
    # Try to make the answer more natural and conversational
    if len(answer.split()) < 4:
        context = (
            answers[0].context
            if hasattr(answers[0], "context") and answers[0].context
            else None
        )
        if context:
            return f"Here's what I found: {answer}. Context: {context}"
        return f"Here's what I found: {answer}"
    return f"Here's what I found: {answer}"


# Warm up models at startup
def warmup():
    print("[DEBUG] Warming up models...")
    try:
        ask_question("What is Haystack?")
    except Exception as e:
        print(f"[DEBUG] Warmup failed: {e}")


warmup()
