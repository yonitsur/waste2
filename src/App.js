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

const ProgressBar = ({ tagged, total, percentage }) => (
    <div className="progress-bar-container">
        <div className="progress-bar-info">
            <span>Progress</span>
            <span>{tagged} / {total} Labeled</span>
        </div>
        <div className="progress-bar-background">
            <div 
                className="progress-bar-fill" 
                style={{ width: `${percentage}%` }}
            ></div>
        </div>
    </div>
);

// --- Constants ---
const CATEGORY_MAP = {
    "Background": "🌿Background",
    "Carton": "📦Carton",
    "Ceramics": "🧱Ceramics",
    "Concrete": "🪨Concrete",
    "Flexible Polymer": "🎈Flexible Polymer",
    "Glass": "🪟Glass",
    "Metal": "⚙️Metal",
    "Paper": "📄Paper",
    "Rigid Polymer": "🪣Rigid Polymer",
    "Rubber": "⚫Rubber",
    "Textile": "👕Textile",
    "Wood": "🪵Wood",
    "Unknown": "❓Unknown"
};

const REVERSE_CATEGORY_MAP = Object.fromEntries(
    Object.entries(CATEGORY_MAP).map(([key, value]) => [value, key])
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

    // --- Memoized Derived State ---
    const displayCategories = useMemo(() => Object.values(CATEGORY_MAP), []);
    const imageKeys = useMemo(() => (jsonData ? Object.keys(jsonData) : []), [jsonData]);

    const currentSplitData = useMemo(() => {
        if (!jsonData || !selectedImageKey) return null;
        const splitKey = `split_${selectedSplit}`;
        return jsonData[selectedImageKey]?.[splitKey] || null;
    }, [jsonData, selectedImageKey, selectedSplit]);

    const sortedMaskKeys = useMemo(() => {
        if (!currentSplitData) return [];
        const keys = Object.keys(currentSplitData).filter(key => key.startsWith('mask_'));
        
        keys.sort((a, b) => {
            const labelA = currentSplitData[a]?.label || 'Unknown';
            const labelB = currentSplitData[b]?.label || 'Unknown';
            const numA = parseInt(a.split('_')[1], 10);
            const numB = parseInt(b.split('_')[1], 10);

            if (labelA === 'Unknown' && labelB !== 'Unknown') return -1;
            if (labelA !== 'Unknown' && labelB === 'Unknown') return 1;
            
            return numA - numB;
        });

        return keys;
    }, [currentSplitData]);
    
    const currentMaskKey = useMemo(() => {
        if (!sortedMaskKeys || sortedMaskKeys.length === 0) return null;
        const safeIndex = Math.min(currentMaskIndex, sortedMaskKeys.length - 1);
        return sortedMaskKeys[safeIndex];
    }, [sortedMaskKeys, currentMaskIndex]);

    const currentMaskData = useMemo(() => {
        if (!currentSplitData || !currentMaskKey) return null;
        return currentSplitData[currentMaskKey];
    }, [currentSplitData, currentMaskKey]);
    
    const progressStats = useMemo(() => {
        if (!currentSplitData || sortedMaskKeys.length === 0) {
            return { tagged: 0, total: 0, percentage: 0 };
        }
        const tagged = sortedMaskKeys.filter(key => (currentSplitData[key]?.label || 'Unknown') !== 'Unknown').length;
        const total = sortedMaskKeys.length;
        const percentage = total > 0 ? (tagged / total) * 100 : 0;
        return { tagged, total, percentage };
    }, [currentSplitData, sortedMaskKeys]);

    // --- Local File Access Logic ---
    const getLocalImageSrc = useCallback(async (imageKey, splitNum, maskNum = null) => {
        if (!directoryHandle) return null;
        try {
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

    // --- Event Handlers ---
    const navigateMasks = useCallback((direction) => {
        setCurrentMaskIndex(prevIndex => {
            const newIndex = prevIndex + direction;
            if (newIndex >= 0 && newIndex < sortedMaskKeys.length) {
                return newIndex;
            }
            return prevIndex; // Return old index if out of bounds
        });
    }, [sortedMaskKeys.length]);


    // --- Effects ---
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'ArrowLeft') {
                navigateMasks(-1);
            } else if (event.key === 'ArrowRight') {
                navigateMasks(1);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [navigateMasks]);

    useEffect(() => {
        if (imageKeys.length > 0 && !selectedImageKey) {
            setSelectedImageKey(imageKeys[0]);
            setSelectedSplit(1);
        } else if (imageKeys.length === 0) {
            setSelectedImageKey('');
        }
    }, [imageKeys, selectedImageKey]);
    
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
        if (!currentMaskKey || !directoryHandle) {
            setMaskImageSrc('');
            return;
        }
        let objectUrl = null;
        const load = async () => {
            setIsMaskLoading(true);
            const maskNumber = currentMaskKey.split('_')[1];
            objectUrl = await getLocalImageSrc(selectedImageKey, selectedSplit, maskNumber);
            setMaskImageSrc(objectUrl || '');
            setIsMaskLoading(false);
        };
        load();
        return () => { if(objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [currentMaskKey, selectedImageKey, selectedSplit, getLocalImageSrc, directoryHandle]);
    
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
             if (imgElement.naturalWidth > 0 && imgElement.offsetWidth > 0) {
                setScale({
                    x: imgElement.offsetWidth / imgElement.naturalWidth,
                    y: imgElement.offsetHeight / imgElement.naturalHeight,
                });
            }
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

    const handleTagging = (displayCategory) => {
        if (!selectedImageKey || !currentSplitData || !currentMaskKey) return;
        
        const cleanCategory = REVERSE_CATEGORY_MAP[displayCategory];
        if (!cleanCategory) return; // Safeguard

        const splitKey = `split_${selectedSplit}`;

        const updatedJsonData = JSON.parse(JSON.stringify(jsonData));
        updatedJsonData[selectedImageKey][splitKey][currentMaskKey].label = cleanCategory;
        setJsonData(updatedJsonData);
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
                        <label htmlFor="image-select">Image</label>
                        <select id="image-select" value={selectedImageKey} onChange={e => setSelectedImageKey(e.target.value)}>
                            {imageKeys.map(key => <option key={key} value={key}>{key}</option>)}
                        </select>
                    </div>
                    <div className="control-group">
                        <label htmlFor="split-select">Split</label>
                        <select id="split-select" value={selectedSplit} onChange={e => setSelectedSplit(Number(e.target.value))}>
                            {Array.from({ length: 16 }, (_, i) => i + 1).map(num => <option key={num} value={num}>{num}</option>)}
                        </select>
                    </div>

                    <ProgressBar 
                        tagged={progressStats.tagged}
                        total={progressStats.total}
                        percentage={progressStats.percentage}
                    />

                    {currentMaskData ? (
                        <div className="mask-info-box">
                            <div className="mask-navigation">
                                <button onClick={() => navigateMasks(-1)} disabled={currentMaskIndex === 0}>Prev</button>
                                <span>{currentMaskKey ? `Mask ${currentMaskKey.split('_')[1]} / ${sortedMaskKeys.length}` : '...'}</span>
                                <button onClick={() => navigateMasks(1)} disabled={currentMaskIndex >= sortedMaskKeys.length - 1}>Next</button>
                            </div>
                            <div className="mask-preview">
                                {isMaskLoading ? <Spinner /> : maskImageSrc ? <img src={maskImageSrc} alt={`Mask ${currentMaskIndex}`} /> : <div className="mask-placeholder">Mask not found</div>}
                            </div>
                            <div className="tagging-section">
                                <div className="tag-buttons">
                                    {displayCategories.map(cat => {
                                        const currentCleanLabel = currentMaskData?.label || 'Unknown';
                                        const isTagged = cat === CATEGORY_MAP[currentCleanLabel];
                                        return <button key={cat} onClick={() => handleTagging(cat)} className={`btn ${isTagged ? 'btn-tagged' : 'btn-primary'}`}>{cat}</button>
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mask-info-box">
                           <h3>All masks in this split appear to be labeled.</h3>
                           <p>Select another split or image to continue.</p>
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
                        <p>Select an image and data folder to begin.</p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="App">
            {modalMessage && <Modal message={modalMessage} onClose={() => setModalMessage('')} />}
            <header className="App-header">
                <h1>WildWaste</h1>
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