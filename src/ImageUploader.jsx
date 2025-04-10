import React, { useState, useRef, useEffect } from "react";
import Uppy from "@uppy/core";
import Tus from "@uppy/tus";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

const ImageUploader = () => {
    const [images, setImages] = useState([]);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [progressInfo, setProgressInfo] = useState({});
    const fileInputRef = useRef(null);
    const uppyRef = useRef(null);
    const uppyFileIdsMapRef = useRef({}); // Map pour associer pendingId -> uppyFileId
    const pendingToOriginalNameRef = useRef({}); // Map pour conserver les noms originaux
    const failedFilesRef = useRef({}); // Pour stocker les fichiers qui ont échoué pour retry
    const progressTimersRef = useRef({});

    // Temps minimum pour afficher la progression (en ms)
    const MIN_PROGRESS_DISPLAY_TIME = 1000;

    // Chemin vers l'image de preview TIFF statique
    const TIFF_PREVIEW_PATH = "/tif-preview.png";

    // Fonction pour vérifier si un fichier est au format TIFF
    const isTiffFile = (file) => {
        return file.type === 'image/tiff' ||
            file.name.toLowerCase().endsWith('.tif') ||
            file.name.toLowerCase().endsWith('.tiff');
    };

    // Fonction pour générer une URL de preview selon le type de fichier
    const getPreviewUrl = (file) => {
        if (isTiffFile(file)) {
            return TIFF_PREVIEW_PATH;
        }
        return URL.createObjectURL(file);
    };

    // Composant pour le progress circle
    const CircularProgress = ({ percentage }) => {
        const radius = 15;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (percentage / 100) * circumference;

        return (
            <svg className="w-10 h-10" viewBox="0 0 36 36">
                <circle
                    cx="18"
                    cy="18"
                    r={radius}
                    fill="transparent"
                    stroke="#e6e6e6"
                    strokeWidth="3"
                />
                <circle
                    cx="18"
                    cy="18"
                    r={radius}
                    fill="transparent"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform="rotate(-90 18 18)"
                />
                <text
                    x="18"
                    y="18"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#ffffff"
                    fontSize="8"
                    fontWeight="bold"
                >
                    {percentage}%
                </text>
            </svg>
        );
    };

    // Composant pour l'icône de succès
    const SuccessIcon = () => (
        <div className="rounded-full bg-green-500 p-1 w-6 h-6 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
        </div>
    );

    // Composant pour l'icône d'échec
    const FailIcon = () => (
        <div className="rounded-full bg-red-500 p-1 w-6 h-6 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </div>
    );

    // Composant pour le bouton de retry
    const RetryButton = ({ onClick }) => (
        <div
            className="absolute bottom-2 right-2 rounded-full bg-blue-500 p-1 w-8 h-8 flex items-center justify-center cursor-pointer hover:bg-blue-600 transition-colors z-20"
            onClick={onClick}
        >
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
        </div>
    );

    // Initialisation d'Uppy une seule fois au montage du composant
    useEffect(() => {
        if (!uppyRef.current) {
            uppyRef.current = new Uppy({
                id: "uppy",
                autoProceed: true,
                allowMultipleUploadBatches: true,
                restrictions: {
                    allowedFileTypes: ["image/*", ".tif", ".tiff", "image/tiff"],
                },
            })
                .use(Tus, {
                    endpoint: "https://tusd.tusdemo.net/dd/", // À remplacer par votre endpoint tus
                    retryDelays: [0, 1000, 3000, 5000],
                    chunkSize: 1 * 1024 * 1024,
                });

            // Configuration des événements Uppy
            uppyRef.current
                .on('file-added', (file) => {
                    const pendingId = file.meta.pendingId;
                    if (pendingId) {
                        // Stocker la relation pendingId -> uppyFileId
                        uppyFileIdsMapRef.current[pendingId] = file.id;

                        // Conserver le nom original pour les fichiers renommés (en cas de retry)
                        if (file.meta.originalName) {
                            pendingToOriginalNameRef.current[pendingId] = file.meta.originalName;
                        }

                        // Initialiser la progression à 0
                        setProgressInfo(prev => ({
                            ...prev,
                            [pendingId]: {
                                progress: 0,
                                bytesUploaded: 0,
                                bytesTotal: file.size,
                                uppyFileId: file.id,
                                startTime: Date.now()
                            }
                        }));
                    }
                })
                .on('upload-progress', (file, progress) => {
                    const { bytesUploaded, bytesTotal } = progress;
                    const percentage = Math.floor((bytesUploaded / bytesTotal) * 100);

                    // Trouver le pendingId correspondant au fichier Uppy
                    const pendingId = Object.keys(uppyFileIdsMapRef.current).find(
                        key => uppyFileIdsMapRef.current[key] === file.id
                    );

                    if (pendingId) {
                        setProgressInfo(prev => {
                            const currentInfo = prev[pendingId] || {};
                            return {
                                ...prev,
                                [pendingId]: {
                                    ...currentInfo,
                                    progress: percentage,
                                    bytesUploaded,
                                    bytesTotal,
                                    uppyFileId: file.id
                                }
                            };
                        });
                    }
                })
                .on("upload-success", (file, response) => {
                    // Récupérer le nom original si c'est un retry, sinon utiliser le nom du fichier
                    const pendingId = Object.keys(uppyFileIdsMapRef.current).find(
                        key => uppyFileIdsMapRef.current[key] === file.id
                    );

                    if (!pendingId) {
                        console.warn("Upload-success: Impossible de trouver le pendingId correspondant");
                        return;
                    }

                    // Récupérer le nom original pour l'affichage
                    const originalName = pendingToOriginalNameRef.current[pendingId] || file.name;

                    // Vérifier si c'est un fichier TIFF
                    const fileIsTiff = isTiffFile(file.data) || file.meta.isTiff;

                    // URL de stockage (URL réelle du fichier téléchargé)
                    const storageUrl = response.uploadURL || URL.createObjectURL(file.data);

                    // URL d'affichage (preview)
                    const displayUrl = fileIsTiff ? TIFF_PREVIEW_PATH : storageUrl;

                    // Vérifier si le temps minimal d'affichage de la progression est écoulé
                    const progressInfo = progressTimersRef.current[pendingId] || {};
                    const startTime = progressInfo.startTime || 0;
                    const elapsedTime = Date.now() - startTime;

                    if (elapsedTime < MIN_PROGRESS_DISPLAY_TIME) {
                        // Si l'upload a été trop rapide, afficher 100% et attendre un peu
                        setProgressInfo(prev => ({
                            ...prev,
                            [pendingId]: {
                                ...prev[pendingId],
                                progress: 100
                            }
                        }));

                        // Définir un timer pour finaliser l'upload après le délai minimum
                        const remainingTime = MIN_PROGRESS_DISPLAY_TIME - elapsedTime;
                        const timerId = setTimeout(() => {
                            finalizeUpload(file, response, pendingId, fileIsTiff, storageUrl, displayUrl, originalName);
                        }, remainingTime);

                        // Stocker le timer ID pour nettoyage ultérieur si nécessaire
                        progressTimersRef.current[pendingId] = {
                            ...progressTimersRef.current[pendingId],
                            timerId
                        };
                    } else {
                        // Si le temps minimum est déjà écoulé, finaliser immédiatement
                        finalizeUpload(file, response, pendingId, fileIsTiff, storageUrl, displayUrl, originalName);
                    }
                })
                .on("upload-error", (file, error) => {
                    console.error("Upload error:", error);

                    // Trouver le pendingId correspondant
                    const pendingId = Object.keys(uppyFileIdsMapRef.current).find(
                        key => uppyFileIdsMapRef.current[key] === file.id
                    );

                    if (pendingId) {
                        // Stocker le fichier d'origine pour retry
                        failedFilesRef.current[pendingId] = {
                            file: file.data,
                            meta: {
                                ...file.meta,
                                isTiff: isTiffFile(file.data) || file.meta.isTiff
                            }
                        };

                        // Marquer le fichier comme échoué
                        setPendingFiles(prev => prev.map(pf => {
                            if (pf.id === pendingId) {
                                return {...pf, uploadFailed: true};
                            }
                            return pf;
                        }));

                        // Nettoyer les infos de progression
                        setProgressInfo(prev => {
                            const newProgress = {...prev};
                            delete newProgress[pendingId];
                            return newProgress;
                        });

                        // Arrêter le timer si existant
                        if (progressTimersRef.current[pendingId]?.timerId) {
                            clearTimeout(progressTimersRef.current[pendingId].timerId);
                            delete progressTimersRef.current[pendingId];
                        }

                        // Supprimer le mappage pour ce fichier
                        delete uppyFileIdsMapRef.current[pendingId];
                    } else {
                        console.warn("Upload-error: Impossible de trouver le pendingId correspondant");
                    }

                    // Vérifier s'il reste des uploads en cours
                    checkRemainingUploads();
                });
        }

        // Nettoyer lors du démontage
        return () => {
            if (uppyRef.current) {
                uppyRef.current.destroy();
                uppyRef.current = null;
            }

            // Nettoyer les URL d'objets
            pendingFiles.forEach(file => {
                if (file.url && file.url.startsWith('blob:')) {
                    URL.revokeObjectURL(file.url);
                }
            });

            // Nettoyer les timers
            Object.values(progressTimersRef.current).forEach(info => {
                if (info.timerId) {
                    clearTimeout(info.timerId);
                }
            });

            // Réinitialiser les références
            uppyFileIdsMapRef.current = {};
            pendingToOriginalNameRef.current = {};
            progressTimersRef.current = {};
            failedFilesRef.current = {};
        };
    }, []);

    // Fonction pour vérifier s'il reste des uploads en cours
    const checkRemainingUploads = () => {
        const remainingUploads = Object.keys(uppyFileIdsMapRef.current).length;
        if (remainingUploads === 0) {
            setIsUploading(false);
        }
    };

    // Fonction pour finaliser l'upload
    const finalizeUpload = (file, response, pendingId, fileIsTiff, storageUrl, displayUrl, originalName) => {
        // Définir l'index par défaut à la longueur du tableau images
        const matchingPendingFile = pendingFiles.find(pf => pf.id === pendingId);
        const index = matchingPendingFile ? matchingPendingFile.index : images.length;

        // Ajouter l'image à la liste des images téléchargées avec succès
        setImages((prevImages) => [
            ...prevImages,
            {
                id: pendingId || file.id, // Utiliser pendingId pour maintenir la cohérence
                name: originalName || file.name,
                url: displayUrl,
                storageUrl: storageUrl,
                isTiff: fileIsTiff,
                index,
                uploadSuccess: true,
            },
        ]);

        // Supprimer le fichier en attente
        if (pendingId) {
            setPendingFiles(prev => prev.filter(pf => pf.id !== pendingId));
        }

        // Nettoyer les infos de progression
        setProgressInfo(prev => {
            const newProgress = {...prev};
            if (pendingId) {
                delete newProgress[pendingId];
            }
            return newProgress;
        });

        // Nettoyer les références
        if (pendingId) {
            delete uppyFileIdsMapRef.current[pendingId];
            delete pendingToOriginalNameRef.current[pendingId];
            delete progressTimersRef.current[pendingId];
            delete failedFilesRef.current[pendingId];
        }

        // Vérifier s'il reste des uploads
        checkRemainingUploads();
    };

    const handleUploadClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = (event) => {
        const files = event.target.files;

        if (files.length > 0) {
            setIsUploading(true);

            // Créer des aperçus locaux pour les fichiers sélectionnés
            const newPendingFiles = Array.from(files).map(file => {
                const id = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const fileIsTiff = isTiffFile(file);
                const previewUrl = getPreviewUrl(file);

                // Enregistrer l'heure de début
                progressTimersRef.current[id] = {
                    startTime: Date.now()
                };

                return {
                    id: id,
                    name: file.name,
                    url: previewUrl,
                    file: file,
                    isPending: true,
                    isTiff: fileIsTiff,
                    index: pendingFiles.length + images.length,
                };
            });

            // Mettre à jour l'état avec les nouveaux fichiers en attente
            setPendingFiles(prevPendingFiles => [...prevPendingFiles, ...newPendingFiles]);

            // Attendre que l'état soit mis à jour avant d'ajouter les fichiers à Uppy
            setTimeout(() => {
                newPendingFiles.forEach(pendingFile => {
                    try {
                        uppyRef.current.addFile({
                            name: pendingFile.name,
                            type: pendingFile.file.type || 'image/tiff',
                            data: pendingFile.file,
                            meta: {
                                pendingId: pendingFile.id,
                                index: pendingFile.index,
                                isTiff: pendingFile.isTiff
                            }
                        });
                    } catch (error) {
                        console.error("Erreur lors de l'ajout du fichier à Uppy:", error);

                        // Marquer le fichier comme ayant échoué
                        setPendingFiles(prev => prev.map(pf => {
                            if (pf.id === pendingFile.id) {
                                return { ...pf, uploadFailed: true };
                            }
                            return pf;
                        }));

                        // Nettoyer le timer si existant
                        if (progressTimersRef.current[pendingFile.id]) {
                            delete progressTimersRef.current[pendingFile.id];
                        }

                        // Vérifier s'il reste des uploads en cours
                        checkRemainingUploads();
                    }
                });
            }, 0);
        }

        // Réinitialiser l'input pour permettre la sélection du même fichier
        event.target.value = "";
    };

    // Fonction pour réessayer un upload échoué
    const handleRetry = (pendingId) => {
        if (!failedFilesRef.current[pendingId]) {
            console.error("Failed file data not found for retry");
            return;
        }

        // Récupérer les données du fichier échoué
        const { file, meta } = failedFilesRef.current[pendingId];

        // Vérifier si le fichier existe encore
        if (!file) {
            console.error("File data is missing for retry");
            return;
        }

        // Réinitialiser l'état d'upload du fichier
        setPendingFiles(prev => prev.map(pf => {
            if (pf.id === pendingId) {
                return {
                    ...pf,
                    uploadFailed: false,
                    retrying: true
                };
            }
            return pf;
        }));

        // Indiquer qu'un upload est en cours
        setIsUploading(true);

        // Réinitialiser la progression
        setProgressInfo(prev => ({
            ...prev,
            [pendingId]: {
                progress: 0,
                bytesUploaded: 0,
                bytesTotal: file.size,
                startTime: Date.now()
            }
        }));

        try {
            // Vérifier si ce pendingId a déjà un fichier dans Uppy
            // (cela ne devrait pas être le cas après l'erreur, mais vérifions par sécurité)
            const existingUppyFileId = Object.entries(uppyFileIdsMapRef.current)
                .find(([key, value]) => key === pendingId);

            if (existingUppyFileId) {
                // Si le fichier existe encore dans Uppy, le supprimer d'abord
                try {
                    uppyRef.current.removeFile(existingUppyFileId[1]);
                } catch (error) {
                    console.warn("Erreur lors de la suppression du fichier existant:", error);
                    // Continuer même si la suppression échoue
                }

                // Supprimer du mappage
                delete uppyFileIdsMapRef.current[pendingId];
            }

            // Créer un nom unique pour éviter les problèmes de duplication
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substr(2, 5);
            const originalName = pendingToOriginalNameRef.current[pendingId] ||
                meta.originalName ||
                file.name;

            // Stocker le nom original pour un affichage cohérent
            pendingToOriginalNameRef.current[pendingId] = originalName;

            // Créer un nouveau nom pour Uppy (en gardant l'extension)
            const fileExt = originalName.split('.').pop();
            const newName = `retry_${timestamp}_${randomSuffix}.${fileExt}`;

            // Créer un nouveau blob si nécessaire pour garantir un fichier unique
            // Crée une copie du fichier original
            const fileBlob = new Blob([file], { type: file.type || 'image/tiff' });

            // Ajouter le fichier à Uppy avec le nouveau nom
            uppyRef.current.addFile({
                name: newName,
                type: file.type || 'image/tiff',
                data: fileBlob,
                meta: {
                    ...meta,
                    pendingId: pendingId,
                    originalName: originalName,
                    isRetry: true
                }
            });

            // Enregistrer l'heure de début pour la progression
            progressTimersRef.current[pendingId] = {
                startTime: Date.now()
            };
        } catch (error) {
            console.error("Erreur lors de la nouvelle tentative d'upload:", error);

            // Remettre le fichier en état d'échec
            setPendingFiles(prev => prev.map(pf => {
                if (pf.id === pendingId) {
                    return {
                        ...pf,
                        uploadFailed: true,
                        retrying: false
                    };
                }
                return pf;
            }));

            // Nettoyer les infos de progression
            setProgressInfo(prev => {
                const newProgress = {...prev};
                delete newProgress[pendingId];
                return newProgress;
            });

            // Vérifier s'il reste des uploads en cours
            checkRemainingUploads();
        }
    };

    // Fonction pour réessayer tous les uploads échoués
    const handleRetryAll = () => {
        // Récupérer tous les IDs de fichiers échoués
        const failedIds = pendingFiles
            .filter(file => file.uploadFailed)
            .map(file => file.id);

        // Si aucun fichier échoué, ne rien faire
        if (failedIds.length === 0) return;

        // Réessayer chaque fichier échoué avec un délai pour éviter les conflits
        failedIds.forEach((pendingId, index) => {
            // Ajouter un délai croissant pour chaque fichier
            setTimeout(() => {
                handleRetry(pendingId);
            }, index * 100); // 100ms de délai entre chaque retry
        });
    };

    const handleDragEnd = (result) => {
        if (!result.destination) return;

        // Combiner les images téléchargées et en attente
        const allItems = [...images, ...pendingFiles];
        const items = Array.from(allItems);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        // Mettre à jour les indices et séparer les listes
        const updatedItems = items.map((item, index) => ({
            ...item,
            index,
        }));

        // Séparer les images téléchargées et en attente
        const updatedImages = updatedItems.filter(item => !item.isPending);
        const updatedPendingFiles = updatedItems.filter(item => item.isPending);

        setImages(updatedImages);
        setPendingFiles(updatedPendingFiles);
    };

    const handleCreateExperiment = () => {
        // S'il n'y a plus de fichiers en attente, créer l'expérience
        console.log("Images ordonnées:", images);
        // Appel API ou autre logique ici
    };

    // Vérifier s'il y a des fichiers échoués
    const hasFailedFiles = pendingFiles.some(file => file.uploadFailed);

    // Fonction pour rendre la grille d'images
    const renderImageGrid = () => {
        // Combiner les images déjà téléchargées et celles en attente
        const allImages = [...images, ...pendingFiles];

        // Trier par index pour maintenir l'ordre
        allImages.sort((a, b) => a.index - b.index);

        // Si aucune image, afficher un message
        if (allImages.length === 0) {
            return (
                <div className="empty-state">
                    <p className="text-gray-600 text-center">No images selected yet. Select some images to begin.</p>
                </div>
            );
        }

        return (
            <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable
                    droppableId="images"
                    direction="horizontal"
                    isDropDisabled={false}
                    isCombineEnabled={false}
                    ignoreContainerClipping={false}
                    type="DEFAULT"
                >
                    {(provided, snapshot) => (
                        <div
                            className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-4 mb-8 max-h-[500px] overflow-y-auto p-1 ${snapshot.isDraggingOver ? 'bg-blue-50' : ''}`}
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                        >
                            {allImages.map((image, index) => {
                                // Trouver les informations de progression pour ce fichier
                                const progress = progressInfo[image.id] || { progress: 0 };
                                const showProgressCircle = image.isPending && !image.uploadFailed && (image.retrying || !('uploadFailed' in image));

                                return (
                                    <Draggable
                                        key={String(image.id)}
                                        draggableId={String(image.id)}
                                        index={index}
                                        isDragDisabled={showProgressCircle}
                                        disableInteractiveElementBlocking={true}
                                    >
                                        {(provided, snapshot) => (
                                            <div
                                                className={`relative rounded-lg overflow-hidden bg-gray-100 shadow cursor-grab flex flex-col ${snapshot.isDragging ? 'shadow-md' : 'shadow-sm'}`}
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                {...provided.dragHandleProps}
                                                style={{
                                                    ...provided.draggableProps.style
                                                }}
                                            >
                                                <div className="absolute top-1 left-1 bg-black bg-opacity-60 text-white text-xs font-bold px-1.5 py-0.5 rounded z-10">
                                                    {String(index + 1).padStart(2, '0')}
                                                </div>
                                                <div className="w-full h-[100px] overflow-hidden relative">
                                                    <img
                                                        src={image.url}
                                                        alt={image.name}
                                                        className={`w-full h-full object-cover ${image.uploadFailed ? 'opacity-70' : ''}`}
                                                    />

                                                    {/* Badge TIFF si nécessaire */}
                                                    {image.isTiff && (
                                                        <div className="absolute top-1 right-1 bg-yellow-500 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                                                            TIFF
                                                        </div>
                                                    )}

                                                    {/* Affichage progress circle */}
                                                    {showProgressCircle && (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                                                            <CircularProgress percentage={progress.progress || 0} />
                                                        </div>
                                                    )}

                                                    {/* Icône de succès pour les uploads terminés */}
                                                    {image.uploadSuccess && (
                                                        <div className="absolute bottom-2 right-2">
                                                            <SuccessIcon />
                                                        </div>
                                                    )}

                                                    {/* Icône d'échec pour les uploads échoués */}
                                                    {image.uploadFailed && !image.retrying && (
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-30">
                                                            <div className="mb-2">
                                                                <FailIcon />
                                                            </div>
                                                            <p className="text-white text-xs text-center px-2 mb-4">Upload failed</p>
                                                            <div className="z-20" onClick={(e) => {
                                                                e.stopPropagation(); // Empêcher le déclenchement du drag
                                                                handleRetry(image.id);
                                                            }}>
                                                                <RetryButton />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-600 p-1 whitespace-nowrap overflow-hidden text-ellipsis bg-gray-100">
                                                    {image.name}
                                                </div>
                                            </div>
                                        )}
                                    </Draggable>
                                );
                            })}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        );
    };

    return (
        <div className="bg-white rounded-lg shadow-lg w-[90%] max-w-[900px] mx-auto p-5 relative">
            <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-medium m-0 text-gray-800">Upload images</h2>
                <button className="bg-transparent border-0 text-2xl cursor-pointer text-gray-400">&times;</button>
            </div>

            <p className="text-gray-600 mb-5 text-sm">
                Please make sure your images are correctly ordered according to your experiment setup
            </p>

            {/* Rendu de la grille d'images */}
            {renderImageGrid()}

            <div className="flex justify-center gap-3 mb-5">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                    multiple
                    accept="image/*,.tif,.tiff"
                />
                <button
                    className="flex items-center justify-center bg-white border border-gray-300 rounded px-4 py-2 text-sm text-gray-700 cursor-pointer transition hover:bg-gray-100 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed before:content-['↑'] before:mr-2"
                    onClick={handleUploadClick}
                    disabled={isUploading}
                >
                    {isUploading ? "Uploading..." : "Select more images"}
                </button>

                {/* Bouton de retry pour tous les fichiers échoués */}
                {hasFailedFiles && (
                    <button
                        className="flex items-center justify-center bg-blue-500 border border-blue-600 rounded px-4 py-2 text-sm text-white cursor-pointer transition hover:bg-blue-600"
                        onClick={handleRetryAll}
                        disabled={isUploading}
                    >
                        <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Retry All Failed
                    </button>
                )}
            </div>

            <button
                className="block w-full bg-blue-500 text-white border-0 rounded py-3 text-base font-medium cursor-pointer transition hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed"
                onClick={handleCreateExperiment}
                disabled={(images.length === 0 && pendingFiles.length === 0) || isUploading || hasFailedFiles}
            >
                {isUploading ? "Uploading..." : hasFailedFiles ? "Retry Failed Uploads to Continue" : "Create Experiment"}
            </button>
        </div>
    );
};

export default ImageUploader;