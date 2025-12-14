#!/usr/bin/env python3
"""
Batch Bill Processing Script
Process multiple bill images in batch
"""

import os
import json
import asyncio
from pathlib import Path
from typing import List, Dict, Optional
import aiohttp
import aiofiles


class BatchProcessor:
    """Process multiple bill images in batch"""
    
    def __init__(self, api_url: str = "http://localhost:8000"):
        self.api_url = api_url
    
    async def process_directory(
        self,
        directory: str,
        output_file: Optional[str] = None,
        use_preprocessing: bool = True
    ) -> List[Dict]:
        """
        Process all images in a directory
        
        Args:
            directory: Directory containing bill images
            output_file: Optional JSON file to save results
            use_preprocessing: Enable image preprocessing
        
        Returns:
            List of extraction results
        """
        image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff'}
        image_files = [
            f for f in Path(directory).iterdir()
            if f.suffix.lower() in image_extensions
        ]
        
        if not image_files:
            print(f"No image files found in {directory}")
            return []
        
        print(f"Processing {len(image_files)} images...")
        
        results = []
        async with aiohttp.ClientSession() as session:
            for image_file in image_files:
                try:
                    result = await self._process_image(
                        session,
                        str(image_file),
                        use_preprocessing
                    )
                    result['filename'] = image_file.name
                    results.append(result)
                    print(f"✓ Processed: {image_file.name}")
                except Exception as e:
                    print(f"✗ Error processing {image_file.name}: {e}")
                    results.append({
                        'filename': image_file.name,
                        'error': str(e)
                    })
        
        # Save results if output file specified
        if output_file:
            async with aiofiles.open(output_file, 'w') as f:
                await f.write(json.dumps(results, indent=2))
            print(f"\nResults saved to {output_file}")
        
        return results
    
    async def _process_image(
        self,
        session: aiohttp.ClientSession,
        image_path: str,
        use_preprocessing: bool
    ) -> Dict:
        """Process a single image"""
        async with aiofiles.open(image_path, 'rb') as f:
            image_data = await f.read()
        
        data = aiohttp.FormData()
        data.add_field('file', image_data, filename=os.path.basename(image_path))
        data.add_field('use_preprocessing', str(use_preprocessing).lower())
        
        async with session.post(
            f"{self.api_url}/api/ocr/extract",
            data=data
        ) as response:
            return await response.json()


async def main():
    """Example usage"""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python batch_processor.py <directory> [output.json]")
        sys.exit(1)
    
    directory = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    processor = BatchProcessor()
    results = await processor.process_directory(directory, output_file)
    
    print(f"\nProcessed {len(results)} images")
    print(f"Successful: {sum(1 for r in results if 'error' not in r)}")
    print(f"Failed: {sum(1 for r in results if 'error' in r)}")


if __name__ == "__main__":
    asyncio.run(main())
