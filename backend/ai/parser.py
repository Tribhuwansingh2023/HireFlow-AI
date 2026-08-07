import os
from typing import Union, BinaryIO
from pypdf import PdfReader


def extract_text_from_pdf(pdf_source: Union[str, BinaryIO, bytes]) -> str:
    """
    Extracts text content from a PDF file path, file-like object, or raw bytes.

    Args:
        pdf_source: File path (str), file object (BinaryIO), or raw bytes.

    Returns:
        Extracted plain text content as a single string.
    """
    try:
        reader = PdfReader(pdf_source)
        text_content = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                text_content.append(page_text)
        
        full_text = "\n\n".join(text_content).strip()
        return full_text if full_text else "No extractable text found in PDF."
    except Exception as e:
        return f"Error extracting text from PDF: {str(e)}"
