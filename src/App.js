import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
    const [tags, setTags] = useState({});
    const [mainImageSrc, setMainImageSrc] = useState('');
    const [maskImageSrc, setMaskImageSrc] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isMaskLoading, setIsMaskLoading] = useState(false); // Dedicated loading state for mask
    const [error, setError] = useState(null);
    const [modalMessage, setModalMessage] = useState('');

    // --- Constants ---
    const CATEGORIES = useMemo(() => ["Building", "Vehicle", "Tree", "Road", "Person", "Other"], []);

    // --- Memoized Derived State ---
    const imageKeys = useMemo(() => (jsonData ? Object.keys(jsonData) : []), [jsonData]);

    const currentSplitData = useMemo(() => {
        if (!jsonData || !selectedImageKey) return null;
        const splitKey = `split_${selectedSplit - 1}`;
        return jsonData[selectedImageKey]?.[splitKey] || null;
    }, [jsonData, selectedImageKey, selectedSplit]);

    const maskKeys = useMemo(() => {
        if (!currentSplitData) return [];
        return Object.keys(currentSplitData).filter(key => key.startsWith('mask_')).sort((a, b) => parseInt(a.split('_')[1], 10) - parseInt(b.split('_')[1], 10));
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
            const splitFolderName = `split_${splitNum - 1}`;
            const imageDirHandle = await directoryHandle.getDirectoryHandle(imageKey);
            const splitDirHandle = await imageDirHandle.getDirectoryHandle(splitFolderName);

            let fileName;
            if (maskNum !== null) {
                fileName = `mask_${maskNum}.jpg`;
            } else {
                fileName = `split_${splitNum - 1}.jpg`;
            }

            const fileHandle = await splitDirHandle.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            return URL.createObjectURL(file);

        } catch (err) {
            console.error(`Could not find or access image: ${err.message}`);
            setError(`Could not find image file. Expected path: /${imageKey}/${`split_${splitNum-1}`}/${maskNum !== null ? `mask_${maskNum}.jpg` : `split_${splitNum-1}.jpg`}`);
            return null;
        }
    }, [directoryHandle]);

    // --- Effects ---
    useEffect(() => {
        if (imageKeys.length > 0) {
            setSelectedImageKey(imageKeys[0]);
            setSelectedSplit(1);
            setCurrentMaskIndex(0);
            // Do not reset tags here, so they persist across JSON loads if desired
        } else {
            setSelectedImageKey('');
        }
    }, [imageKeys]);
    
    useEffect(() => {
        setCurrentMaskIndex(0);
    }, [selectedImageKey, selectedSplit]);

    // Effect to load the main split image from local directory
    useEffect(() => {
        if (!selectedImageKey || !directoryHandle) {
            setMainImageSrc('');
            return;
        };
        
        let objectUrl = null;
        const load = async () => {
            setIsLoading(true);
            setError(null); // Clear previous errors on new load
            objectUrl = await getLocalImageSrc(selectedImageKey, selectedSplit);
            setMainImageSrc(objectUrl || '');
            setIsLoading(false);
        };
        load();

        // Cleanup function to revoke the object URL to prevent memory leaks
        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [selectedImageKey, selectedSplit, getLocalImageSrc, directoryHandle]);

    // Effect to load the current mask image from local directory
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
        
        // Cleanup function to revoke the object URL to prevent memory leaks
        return () => {
            if(objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [currentMaskData, currentMaskIndex, selectedImageKey, selectedSplit, getLocalImageSrc, directoryHandle, maskKeys]);

    // --- Event Handlers ---
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file && file.type === "application/json") {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = JSON.parse(e.target.result);
                    if (typeof content === 'object' && content !== null) {
                        setJsonData(content);
                        setDirectoryHandle(null);
                        setTags({}); // Reset tags when new master JSON is loaded
                        setError(null);
                    } else {
                       throw new Error("JSON is empty or not in the expected format.");
                    }
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
    
    const handleTagFileChange = (event) => {
        const file = event.target.files[0];
        if (file && file.type === "application/json") {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = JSON.parse(e.target.result);
                    if (typeof content === 'object' && content !== null) {
                        setTags(content);
                        setModalMessage('Tags loaded successfully!');
                        setError(null);
                    } else {
                       throw new Error("Tag file is empty or not in the expected format.");
                    }
                } catch (err) {
                    setError(`Error parsing tag file: ${err.message}`);
                }
            };
            reader.readAsText(file);
        } else {
            setError("Please upload a valid JSON file for tags.");
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
                console.error(err);
            }
        }
    };

    const handleTagging = (category) => {
        if (!selectedImageKey || !currentSplitData || !currentMaskData) return;
        
        const splitKey = `split_${selectedSplit - 1}`;
        const maskKey = maskKeys[currentMaskIndex];
        const uniqueMaskId = `${selectedImageKey}/${splitKey}/${maskKey}`;

        setTags(prevTags => ({ ...prevTags, [uniqueMaskId]: category }));

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
    
    const exportTags = () => {
        if (Object.keys(tags).length === 0) {
            setModalMessage("No tags to export yet!");
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tags, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "tagged_data.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    // --- Rendering Logic ---
    const BoundingBox = () => {
        if (!currentMaskData || !currentMaskData.box) return null;
        const [left, top, right, bottom] = currentMaskData.box;
        return <div className="bounding-box" style={{ left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` }}></div>;
    };

    const renderContent = () => {
        if (!jsonData) {
            return (
                <div className="placeholder-container">
                    <h2 className="placeholder-title">Step 1: Please load a JSON file to begin.</h2>
                </div>
            );
        }
        if (!directoryHandle) {
             return (
                <div className="placeholder-container">
                    <h2 className="placeholder-title">Step 2: Select your main image data folder.</h2>
                    <p>This should be the folder that contains all your image name subfolders.</p>
                    <button onClick={handleDirectoryLoad} className="btn btn-purple">
                        Load Image Directory
                    </button>
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
                                        const uniqueMaskId = `${selectedImageKey}/split_${selectedSplit - 1}/${maskKeys[currentMaskIndex]}`;
                                        const isTagged = tags[uniqueMaskId] === cat;
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
                            <img src={mainImageSrc} alt={`Split ${selectedSplit} for ${selectedImageKey}`} />
                            <BoundingBox />
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
                     <label htmlFor="file-upload" className="btn btn-primary">Load JSON</label>
                    <input id="file-upload" type="file" accept=".json" onChange={handleFileChange} style={{display: 'none'}}/>
                    
                    <label htmlFor="tag-file-upload" className="btn btn-primary">Load Tags</label>
                    <input id="tag-file-upload" type="file" accept=".json" onChange={handleTagFileChange} style={{display: 'none'}}/>
                    
                    <button onClick={exportTags} disabled={!jsonData || !directoryHandle} className="btn btn-success">Export Tags</button>
                </div>
            </header>

            {error && <div className="error-banner">{error}</div>}

            <main className="App-content">
                {renderContent()}
            </main>
        </div>
    );
}