import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './App.css'; // Import the standard CSS file

// --- Helper Components ---

const Modal = ({ message, onClose }) => (
    <div className="modal-overlay">
        <div className="modal-content">
            <p>{message}</p>
            <button onClick={onClose} className="btn btn-primary">
                Close
            </button>
        </div>
    </div>
);

const Spinner = () => (
    <div className="spinner"></div>
);

// --- Main Application Component ---

export default function App() {
    // --- State Management ---
    const [jsonData, setJsonData] = useState(null);
    const [directoryHandle, setDirectoryHandle] = useState(null);
    const [selectedImageKey, setSelectedImageKey] = useState('');
    const [selectedSplit, setSelectedSplit] = useState(1);
    const [currentMaskIndex, setCurrentMaskIndex] = useState(0);
    const [mainImageSrc, setMainImageSrc] = useState('');
    const [maskImageSrc, setMaskImageSrc] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isMaskLoading, setIsMaskLoading] = useState(false);
    const [error, setError] = useState(null);
    const [modalMessage, setModalMessage] = useState('');
    const [scale, setScale] = useState({ x: 1, y: 1 });
    
    const imageRef = useRef(null);

    // --- Constants ---
    const CATEGORIES = useMemo(() => [
        "Background", "Carton", "Ceramics", "Concrete", "Gypsum", "Glass", 
        "Metal (general)", "Metal (iron bender)", "Metal (pipe)", "Nylon", 
        "Paper", "Plastic (general)", "Plastic (big bag)", "Plastic (bucket)", 
        "Plastic (pipe)", "Plastic (sand bag)", "Rubber", "Styrofoam", 
        "Textile", "Unknown", "Wood (pallet)", "Wood (scraps/cuttings)"
    ], []);

    // --- Memoized Derived State ---
    const imageKeys = useMemo(() => (jsonData ? Object.keys(jsonData) : []), [jsonData]);

    const currentSplitData = useMemo(() => {
        if (!jsonData || !selectedImageKey) return null;
        // Accessing split data with 1-based index (e.g., "split_1")
        const splitKey = `split_${selectedSplit}`;
        return jsonData[selectedImageKey]?.[splitKey] || null;
    }, [jsonData, selectedImageKey, selectedSplit]);

    // Sort masks to show "Unknown" first
    const maskKeys = useMemo(() => {
        if (!currentSplitData) return [];
        const keys = Object.keys(currentSplitData).filter(key => key.startsWith('mask_'));
        
        keys.sort((a, b) => {
            const labelA = currentSplitData[a]?.label || 'Unknown';
            const labelB = currentSplitData[b]?.label || 'Unknown';
            const numA = parseInt(a.split('_')[1], 10);
            const numB = parseInt(b.split('_')[1], 10);

            if (labelA === 'Unknown' && labelB !== 'Unknown') return -1;
            if (labelA !== 'Unknown' && labelB === 'Unknown') return 1;
            
            return numA - numB; // Fallback to numeric sort for masks with same label status
        });

        return keys;
    }, [currentSplitData]);

    const currentMaskData = useMemo(() => {
        if (!currentSplitData || maskKeys.length === 0) return null;
        const maskKey = maskKeys[currentMaskIndex];
        return currentSplitData[maskKey];
    }, [currentSplitData, maskKeys, currentMaskIndex]);

    // --- Local File Access Logic ---
    const getLocalImageSrc = useCallback(async (imageKey, splitNum, maskNum = null) => {
        if (!directoryHandle) return null;
        try {
            // File paths are 1-based, so we use the UI split number directly.
            const splitFolderName = `split_${splitNum}`;
            const imageDirHandle = await directoryHandle.getDirectoryHandle(imageKey);
            const splitDirHandle = await imageDirHandle.getDirectoryHandle(splitFolderName);
            
            const fileName = maskNum !== null 
                ? `mask_${maskNum}.jpg` 
                : `split_${splitNum}.jpg`;
            
            const fileHandle = await splitDirHandle.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            return URL.createObjectURL(file);
        } catch (err) {
            console.error(`Could not find or access image: ${err.message}`);
            const expectedPath = `/${imageKey}/${`split_${splitNum}`}/${maskNum !== null ? `mask_${maskNum}.jpg` : `split_${splitNum}.jpg`}`;
            setError(`Could not find image file. Expected path: ${expectedPath}`);
            return null;
        }
    }, [directoryHandle]);

    // --- Effects ---
    useEffect(() => {
        if (imageKeys.length > 0) {
            setSelectedImageKey(imageKeys[0]);
            setSelectedSplit(1);
        } else {
            setSelectedImageKey('');
        }
    }, [imageKeys]);
    
    useEffect(() => {
        setCurrentMaskIndex(0);
    }, [selectedImageKey, selectedSplit]);

    useEffect(() => {
        if (!selectedImageKey || !directoryHandle) {
            setMainImageSrc('');
            return;
        }
        let objectUrl = null;
        const load = async () => {
            setIsLoading(true);
            setError(null);
            objectUrl = await getLocalImageSrc(selectedImageKey, selectedSplit);
            setMainImageSrc(objectUrl || '');
            setIsLoading(false);
        };
        load();
        return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [selectedImageKey, selectedSplit, getLocalImageSrc, directoryHandle]);

    useEffect(() => {
        if (!currentMaskData || !directoryHandle) {
            setMaskImageSrc('');
            return;
        }
        let objectUrl = null;
        const load = async () => {
            setIsMaskLoading(true);
            const maskNumber = maskKeys[currentMaskIndex].split('_')[1];
            objectUrl = await getLocalImageSrc(selectedImageKey, selectedSplit, maskNumber);
            setMaskImageSrc(objectUrl || '');
            setIsMaskLoading(false);
        };
        load();
        return () => { if(objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [currentMaskData, currentMaskIndex, selectedImageKey, selectedSplit, getLocalImageSrc, directoryHandle, maskKeys]);
    
    // Effect for calculating image scale for BBOX
    useEffect(() => {
        const imgElement = imageRef.current;
        if (!imgElement) return;

        const observer = new ResizeObserver(() => {
            if (imgElement.naturalWidth > 0 && imgElement.offsetWidth > 0) {
                setScale({
                    x: imgElement.offsetWidth / imgElement.naturalWidth,
                    y: imgElement.offsetHeight / imgElement.naturalHeight,
                });
            }
        });

        const handleLoad = () => {
            observer.observe(imgElement);
        };
        
        imgElement.addEventListener('load', handleLoad);
        if (imgElement.complete) {
            handleLoad();
        }

        return () => {
            imgElement.removeEventListener('load', handleLoad);
            observer.disconnect();
        };
    }, [mainImageSrc]);

    // --- Event Handlers ---
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file && file.type === "application/json") {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = JSON.parse(e.target.result);
                    if (typeof content !== 'object' || content === null) {
                        throw new Error("JSON is empty or not an object.");
                    }
                    
                    // Add 'label' field only if it doesn't exist
                    Object.values(content).forEach(image => {
                        Object.values(image).forEach(split => {
                            Object.entries(split).forEach(([key, value]) => {
                                if (key.startsWith('mask_') && !('label' in value)) {
                                    value.label = 'Unknown';
                                }
                            });
                        });
                    });

                    setJsonData(content);
                    setDirectoryHandle(null);
                    setError(null);

                } catch (err) {
                    setError(`Error parsing JSON file: ${err.message}`);
                    setJsonData(null);
                }
            };
            reader.readAsText(file);
        } else {
            setError("Please upload a valid JSON file.");
        }
    };

    const handleDirectoryLoad = async () => {
        try {
            const handle = await window.showDirectoryPicker();
            setDirectoryHandle(handle);
            setError(null);
        } catch (err) {
            if (err.name !== 'AbortError') {
                setError("Could not get directory handle. Please try again.");
            }
        }
    };

    const handleTagging = (category) => {
        if (!selectedImageKey || !currentSplitData || !currentMaskData) return;
        
        const splitKey = `split_${selectedSplit}`;
        const maskKey = maskKeys[currentMaskIndex];

        const updatedJsonData = JSON.parse(JSON.stringify(jsonData));
        updatedJsonData[selectedImageKey][splitKey][maskKey].label = category;
        setJsonData(updatedJsonData);

        if (currentMaskIndex < maskKeys.length - 1) {
            setCurrentMaskIndex(currentMaskIndex + 1);
        } else {
            setModalMessage("All masks in this split have been tagged!");
        }
    };

    const navigateMasks = (direction) => {
        const newIndex = currentMaskIndex + direction;
        if (newIndex >= 0 && newIndex < maskKeys.length) {
            setCurrentMaskIndex(newIndex);
        }
    };
    
    const exportJson = () => {
        if (!jsonData) {
            setModalMessage("No data to export yet!");
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(jsonData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "updated_data.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    // --- Rendering Logic ---
    const BoundingBox = ({ scale }) => {
        if (!currentMaskData?.bbox || !scale.x || !scale.y) return null;
    
        const [x1, y1, x2, y2] = currentMaskData.bbox;
        const style = {
            left: `${x1 * scale.x}px`,
            top: `${y1 * scale.y}px`,
            width: `${(x2 - x1) * scale.x}px`,
            height: `${(y2 - y1) * scale.y}px`,
        };
        return <div className="bounding-box" style={style}></div>;
    };

    const renderContent = () => {
        if (!jsonData) {
            return <div className="placeholder-container"><h2 className="placeholder-title">Step 1: Please load your data JSON file.</h2></div>;
        }
        if (!directoryHandle) {
             return (
                <div className="placeholder-container">
                    <h2 className="placeholder-title">Step 2: Select your main image data folder.</h2>
                    <p>This should be the folder that contains all your image name subfolders.</p>
                    <button onClick={handleDirectoryLoad} className="btn btn-purple">Load Image Directory</button>
                </div>
            );
        }
        return (
            <div className="main-grid">
                <div className="control-panel">
                    <div className="control-group">
                        <label htmlFor="image-select">Image Key</label>
                        <select id="image-select" value={selectedImageKey} onChange={e => setSelectedImageKey(e.target.value)}>
                            {imageKeys.map(key => <option key={key} value={key}>{key}</option>)}
                        </select>
                    </div>
                    <div className="control-group">
                        <label htmlFor="split-select">Split Number</label>
                        <select id="split-select" value={selectedSplit} onChange={e => setSelectedSplit(Number(e.target.value))}>
                            {Array.from({ length: 16 }, (_, i) => i + 1).map(num => <option key={num} value={num}>{num}</option>)}
                        </select>
                    </div>

                    {currentMaskData && (
                        <div className="mask-info-box">
                            <h3>Current Mask</h3>
                            <div className="mask-navigation">
                                <button onClick={() => navigateMasks(-1)} disabled={currentMaskIndex === 0}>Prev</button>
                                <span>{`Mask ${currentMaskIndex + 1} / ${maskKeys.length}`}</span>
                                <button onClick={() => navigateMasks(1)} disabled={currentMaskIndex >= maskKeys.length - 1}>Next</button>
                            </div>
                            <div className="mask-preview">
                                {isMaskLoading ? <Spinner /> : maskImageSrc ? <img src={maskImageSrc} alt={`Mask ${currentMaskIndex}`} /> : <div className="mask-placeholder">Mask not found</div>}
                            </div>
                            <div className="tagging-section">
                                <h3>Tag this mask:</h3>
                                <div className="tag-buttons">
                                    {CATEGORIES.map(cat => {
                                        const currentLabel = currentMaskData?.label || 'Unknown';
                                        const isTagged = currentLabel === cat;
                                        return <button key={cat} onClick={() => handleTagging(cat)} className={`btn ${isTagged ? 'btn-tagged' : 'btn-primary'}`}>{cat}</button>
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="image-viewer">
                    {isLoading ? <Spinner /> : mainImageSrc ? (
                        <div className="image-container">
                            <img
                                ref={imageRef}
                                src={mainImageSrc}
                                alt={`Split ${selectedSplit} for ${selectedImageKey}`}
                            />
                            <BoundingBox scale={scale} />
                        </div>
                    ) : (
                        <p>Select an image to display.</p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="App">
            {modalMessage && <Modal message={modalMessage} onClose={() => setModalMessage('')} />}
            <header className="App-header">
                <h1>Image Tagging Interface (Local)</h1>
                <div className="header-actions">
                     <label htmlFor="file-upload" className="btn btn-primary">Load Data JSON</label>
                    <input id="file-upload" type="file" accept=".json" onChange={handleFileChange} style={{display: 'none'}}/>
                    <button onClick={exportJson} disabled={!jsonData || !directoryHandle} className="btn btn-success">Export Updated JSON</button>
                </div>
            </header>
            {error && <div className="error-banner">{error}</div>}
            <main className="App-content">
                {renderContent()}
            </main>
        </div>
    );
}