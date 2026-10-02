/**
 * @file GunnyBagMasterPage.tsx
 * @description Gunny Bag Master CRUD Page with Bharthi Details.
 */

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import DataGrid, {
  type Column,
} from "../../components/common/DataGrid";

import { PageHeader } from "../../components/common/PageHeader";

import { SearchFilterPanel } from "../../components/common/SearchFilterPanel";

import ConfirmDialog from "../../components/common/ConfirmDialog";

import MasterFormModal, {
  type FormFieldConfig,
} from "./components/MasterFormModal";

import {
  getGunnyBags,
  getNextGunnyBagCode,
  getGunnyBag,
  createGunnyBag,
  updateGunnyBag,
  deleteGunnyBag,
  type GunnyBagResponse,
  type GunnyBagDetailsResponse,
  type GunnyBagSavePayload,
  type GunnyBagBharthiType,
} from "../../services/gunnybagservices/gunnybag.service";

import { onScopeChange } from "../../utils/scopeEvents";
import { usePermissions } from "../../hooks/usePermissions";
import { getBranches, type Branch } from "../../services/branchesservices/branches.service";

/**
 * ============================================================
 * Bharthi UI Row
 * ============================================================
 */
export interface GunnyBagBharthi {
  id?: string;
  gunny_bag_id?: string;
  bharthi: string;
  stock: number | string;
  created_at?: string;
}

/**
 * ============================================================
 * Form Values
 * ============================================================
 */
interface GunnyBagFormValues {
  code: string;
  name: string;
  size: string;
  rate_per_bag: number | string;
  opening_stock: number | string;
  status: "Active" | "Inactive";
}

const getCurrentBranchId = (): string =>
  typeof window === "undefined"
    ? ""
    : localStorage.getItem("cocoper_branch_id") ?? "";

/**
 * ============================================================
 * Helpers
 * ============================================================
 */

/**
 * Converts:
 *
 * 200
 *
 * into:
 *
 * 200-Bharthi
 */
const normalizeBharthi = (
  value: string
): string => {
  const trimmed = String(
    value ?? ""
  ).trim();

  if (!trimmed) {
    return "";
  }

  /**
   * Already in required format:
   *
   * 200-Bharthi
   */
  if (
    /^\d+-Bharthi$/i.test(
      trimmed
    )
  ) {
    return `${trimmed.split("-")[0]}-Bharthi`;
  }

  /**
   * Numeric input:
   *
   * 200 -> 200-Bharthi
   */
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed}-Bharthi`;
  }

  return trimmed;
};

/**
 * ============================================================
 * API Error Helper
 * ============================================================
 *
 * Converts different backend error structures into
 * one readable message.
 */
const getErrorMessage = (
  error: any,
  fallback = "Operation failed"
): string => {
  if (!error) {
    return fallback;
  }

  /**
   * Axios-style response data.
   */
  const responseData =
    error?.response?.data;

  /**
   * Sometimes the error itself contains data.
   */
  const source =
    responseData ??
    error?.data ??
    error;

  /**
   * Simple string error.
   */
  if (typeof source === "string") {
    const trimmed =
      source.trim();

    if (!trimmed) {
      return fallback;
    }

    /**
     * Try JSON string.
     */
    try {
      const parsed =
        JSON.parse(trimmed);

      return getErrorMessage(
        { data: parsed },
        fallback
      );
    } catch {
      return trimmed;
    }
  }

  /**
   * Common message fields.
   */
  if (
    typeof source?.message ===
      "string" &&
    source.message.trim()
  ) {
    return source.message.trim();
  }

  if (
    typeof source?.error ===
      "string" &&
    source.error.trim()
  ) {
    return source.error.trim();
  }

  /**
   * Backend validation object:
   *
   * {
   *   name: ["Name is required"],
   *   code: ["Code already exists"]
   * }
   */
  if (
    source &&
    typeof source === "object"
  ) {
    const messages: string[] = [];

    Object.entries(source).forEach(
      ([key, value]: [
        string,
        any
      ]) => {
        if (
          key === "message" ||
          key === "error"
        ) {
          return;
        }

        if (Array.isArray(value)) {
          value.forEach(
            (item) => {
              if (
                item !== null &&
                item !== undefined
              ) {
                messages.push(
                  String(item)
                );
              }
            }
          );
        } else if (
          value !== null &&
          value !== undefined &&
          typeof value !==
            "object"
        ) {
          messages.push(
            String(value)
          );
        }
      }
    );

    if (messages.length > 0) {
      return messages.join(
        ", "
      );
    }
  }

  /**
   * Error object message.
   */
  if (
    typeof error?.message ===
      "string" &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return fallback;
};

/**
 * ============================================================
 * Component
 * ============================================================
 */
const GunnyBagMasterPage: React.FC =
  () => {
    const { can } =
      usePermissions();

    /**
     * ========================================================
     * Gunny Bag Master State
     * ========================================================
     */
    const [items, setItems] =
      useState<
        GunnyBagResponse[]
      >([]);

    const [loading, setLoading] =
      useState(false);

    const [branches, setBranches] =
      useState<Branch[]>([]);

    const [selectedBranchId, setSelectedBranchId] =
      useState("");

    const [generatedCode, setGeneratedCode] =
      useState("");

    const [search, setSearch] =
      useState("");

    const [modalOpen, setModalOpen] =
      useState(false);

    const [editing, setEditing] =
      useState<
        GunnyBagResponse | null
      >(null);

    /**
     * ========================================================
     * Branch Wise Stock Map
     * ========================================================
     */
    const [
      branchStockMap,
      setBranchStockMap,
    ] = useState<
      Record<string, number>
    >({});

    const [
      selectedToDelete,
      setSelectedToDelete,
    ] = useState<
      GunnyBagResponse | null
    >(null);

    const [
      confirmOpen,
      setConfirmOpen,
    ] = useState(false);

    /**
     * ========================================================
     * Validation Error
     * ========================================================
     */
    const [
      validationError,
      setValidationError,
    ] = useState("");

    /**
     * ========================================================
     * Show Validation Error
     * ========================================================
     */
    const showValidationError = (
      message: string
    ) => {
      setValidationError(
        message
      );

      toast.error(message, {
        duration: 4000,
      });
    };

    /**
     * ========================================================
     * Clear Validation Error
     * ========================================================
     */
    const clearValidationError = () => {
      setValidationError("");
    };

    /**
     * ========================================================
     * Load Gunny Bags
     * ========================================================
     */
    const loadGunnyBags =
      async () => {
        try {
          setLoading(true);

          const data =
            await getGunnyBags(undefined, false);

          /**
           * Always protect DataGrid from non-array data.
           */
          const list =
            Array.isArray(data)
              ? data
              : [];

          /**
           * Sort latest code first.
           *
           * GB-010
           * GB-009
           * GB-008
           */
          const sortedData =
            [...list].sort(
              (a, b) => {
                const codeA =
                  String(
                    a.code ?? ""
                  );

                const codeB =
                  String(
                    b.code ?? ""
                  );

                const numberA =
                  Number(
                    codeA.match(
                      /\d+$/
                    )?.[0] ?? 0
                  );

                const numberB =
                  Number(
                    codeB.match(
                      /\d+$/
                    )?.[0] ?? 0
                  );

                return (
                  numberB -
                  numberA
                );
              }
            );

          setItems(
            sortedData
          );
        } catch (error: any) {
          console.error(
            "Failed to load Gunny Bags:",
            error
          );

          const message =
            getErrorMessage(
              error,
              "Failed to load Gunny Bags"
            );

          toast.error(
            message,
            {
              duration: 4000,
            }
          );
        } finally {
          setLoading(false);
        }
      };

    /**
     * ========================================================
     * Initial Load
     * ========================================================
     */
    useEffect(() => {
      loadGunnyBags();

      // Re-fetch when the organization or branch changes in the header.
      return onScopeChange(() =>
        loadGunnyBags()
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const loadBranches = async () => {
        try {
          const availableBranches = await getBranches();
          setBranches(Array.isArray(availableBranches) ? availableBranches : []);
        } catch (error: any) {
          toast.error(getErrorMessage(error, "Failed to load branches"));
          setBranches([]);
        }
      };

      loadBranches();
      return onScopeChange(loadBranches);
    }, []);

    /**
     * ========================================================
     * Form Fields
     * ========================================================
     */
    const fields:
      FormFieldConfig[] =
      useMemo(
        () => [
          {
            name: "code",
            label: "Code",
            type: "text",
            required: true,
            readOnly: true,
          },
          {
            name: "name",
            label: "Name",
            type: "text",
            required: true,
          },
          {
            name: "size",
            label: "Size",
            type: "text",
            required: true,
          },
          {
            name: "opening_stock",
            label: "Opening Stock",
            type: "number",
            readOnly: true,
          },
          {
            name: "rate_per_bag",
            label: "Rate / Bag",
            type: "number",
            required: true,
          },
          {
            name: "status",
            label: "Status",
            type: "select",
            required: true,
            options: [
              {
                label: "Active",
                value: "Active",
              },
              {
                label: "Inactive",
                value: "Inactive",
              },
            ],
          },
        ],
        []
      );

    /**
     * ========================================================
     * Add Gunny Bag
     * ========================================================
     */
    const prepareNewGunnyBag =
      async (branchId: string) => {
        const code = await getNextGunnyBagCode(branchId);

        setEditing({
          id: "",
          code,
          name: "",
          size: "",
          rate_per_bag: 0,
          opening_stock: 0,
          status: "Active",
          created_at: "",
          branch_id: branchId,
        });
        setGeneratedCode(code);
        setSelectedBranchId(branchId);
        setBranchStockMap({});
        setModalOpen(true);
      };

    const openAdd =
      async () => {
        try {
          clearValidationError();
          await prepareNewGunnyBag(getCurrentBranchId());
        } catch (error: any) {
          console.error(
            "Failed to generate Gunny Bag code:",
            error
          );

          const message =
            getErrorMessage(
              error,
              "Failed to generate Gunny Bag code"
            );

          toast.error(
            message,
            {
              duration: 4000,
            }
          );
        }
      };

    /**
     * ========================================================
     * Edit Gunny Bag
     * ========================================================
     */
    const openEdit =
      async (
        row: GunnyBagResponse
      ) => {
        try {
          clearValidationError();

          /**
           * Set main bag details immediately.
           */
          setEditing(row);
          setGeneratedCode(row.code);
          setSelectedBranchId(row.branch_id ?? "");

          /**
           * Initialize branch stock map
           *
           * Priority:
           * 1. Use branch_stock if available (new format with branch-wise stock)
           * 2. Fall back to opening_stock for single branch (legacy format)
           */
          if (row.branch_stock && Object.keys(row.branch_stock).length > 0) {
            setBranchStockMap(row.branch_stock);
          } else if (row.opening_stock) {
            setBranchStockMap({
              [row.branch_id ?? ""]: row.opening_stock,
            });
          } else {
            setBranchStockMap({});
          }

          /**
           * Open modal immediately.
           */
          setModalOpen(
            true
          );
        } catch (error: any) {
          console.error(
            "Failed to load Gunny Bag details:",
            error
          );

          const message =
            getErrorMessage(
              error,
              "Failed to load Gunny Bag details"
            );

          showValidationError(
            message
          );
        }
      };

    /**
     * ========================================================
     * Build Save Payload
     * ========================================================
     */
    const buildPayload = (
      values: GunnyBagFormValues,
      branchId = selectedBranchId
    ): GunnyBagSavePayload => {
      return {
        code: String(
          values.code ?? ""
        ).trim(),

        name: String(
          values.name ?? ""
        ).trim(),

        size: String(
          values.size ?? ""
        ).trim(),

        rate_per_bag:
          Number(
            values.rate_per_bag ||
              0
          ),

        opening_stock:
          totalBranchStock,

        status:
          values.status,

        bharthi_types: [],
        branch_id: branchId || null,
        branch_stock: branchStockMap,
      };
    };

    /**
     * ========================================================
     * Save Gunny Bag
     * ========================================================
     */
    const handleSave =
      async (
        values: GunnyBagFormValues,
        resetAfter: boolean
      ) => {
        try {
          clearValidationError();

          /**
           * Normalize values coming from react-hook-form.
           */
          const code =
            String(
              values.code ?? ""
            ).trim();

          const name =
            String(
              values.name ?? ""
            ).trim();

          const size =
            String(
              values.size ?? ""
            ).trim();

          const ratePerBag =
            Number(
              values.rate_per_bag ||
                0
            );

          const openingStock =
            Number(
              values.opening_stock ||
                0
            );

          /**
           * ==================================================
           * Main field validation
           * ==================================================
           */
          if (!code) {
            showValidationError(
              "Gunny Bag code is required"
            );
            return;
          }

          if (!name) {
            showValidationError(
              "Gunny Bag name is required"
            );
            return;
          }

          if (!size) {
            showValidationError(
              "Gunny Bag size is required"
            );
            return;
          }

          if (
            !Number.isFinite(
              ratePerBag
            ) ||
            ratePerBag < 0
          ) {
            showValidationError(
              "Rate / Bag must be a valid non-negative number"
            );
            return;
          }

          /**
           * ==================================================
           * Branch Stock validation
           * ==================================================
           */
          if (totalBranchStock <= 0) {
            showValidationError(
              "Please add stock for at least one branch"
            );
            return;
          }

          const branchId =
            selectedBranchId ||
            branches.find(
              (branch) => Number(branchStockMap[branch.id]) > 0
            )?.id ||
            "";

          if (!branchId) {
            showValidationError(
              "Please add stock to an available branch"
            );
            return;
          }

          /**
           * ==================================================
           * Build final payload
           * ==================================================
           */
          const payload =
            buildPayload({
              code,
              name,
              size,
              rate_per_bag:
                ratePerBag,
              opening_stock:
                totalBranchStock,
              status:
                values.status,
            }, branchId);

          console.log(
            "Gunny Bag Save Payload:",
            payload
          );

          /**
           * ==================================================
           * UPDATE
           * ==================================================
           */
          if (
            editing?.id
          ) {
            console.log(
              "Updating Gunny Bag:",
              editing.id
            );

            await updateGunnyBag(
              editing.id,
              payload
            );

            toast.success(
              "Gunny Bag updated successfully",
              {
                duration: 3000,
              }
            );
          }

          /**
           * ==================================================
           * CREATE
           * ==================================================
           */
          else {
            console.log(
              "Creating Gunny Bag:",
              payload
            );

            await createGunnyBag(
              payload
            );

            toast.success(
              "Gunny Bag created successfully",
              {
                duration: 3000,
              }
            );
          }

          /**
           * Refresh main grid.
           */
          await loadGunnyBags();

          /**
           * ==================================================
           * SAVE
           * ==================================================
           */
          if (!resetAfter) {
            setModalOpen(
              false
            );

            setEditing(
              null
            );

            setBranchStockMap({});

            clearValidationError();

            return;
          }

          /**
           * ==================================================
           * SAVE & NEW
           * ==================================================
           */
          await prepareNewGunnyBag(branchId);

          clearValidationError();
        } catch (error: any) {
          console.error(
            "Gunny Bag save error:",
            error
          );

          const message =
            getErrorMessage(
              error,
              "Operation failed"
            );

          showValidationError(
            message
          );
        }
      };

    /**
     * ========================================================
     * Delete
     * ========================================================
     */
    const handleDelete = (
      row: GunnyBagResponse
    ) => {
      setSelectedToDelete(
        row
      );

      setConfirmOpen(
        true
      );
    };

    /**
     * ========================================================
     * Confirm Delete
     * ========================================================
     */
    const confirmDelete =
      async () => {
        if (
          !selectedToDelete
        ) {
          return;
        }

        try {
          await deleteGunnyBag(
            selectedToDelete.id
          );

          toast.success(
            "Gunny Bag deleted successfully",
            {
              duration: 3000,
            }
          );

          await loadGunnyBags();

          setSelectedToDelete(
            null
          );

          setConfirmOpen(
            false
          );
        } catch (error: any) {
          console.error(
            "Delete Gunny Bag error:",
            error
          );

          const message =
            getErrorMessage(
              error,
              "Delete failed"
            );

          toast.error(
            message,
            {
              duration: 4000,
            }
          );
        }
      };

    /**
     * ========================================================
     * Grid Columns
     * ========================================================
     */
    const columns: Column[] =
      useMemo(
        () => [
          {
            key: "code",
            label: "Code",
            width: "12%",
          },

          {
            key: "name",
            label: "Name",
            width: "22%",
          },

          {
            key: "size",
            label: "Size",
            width: "18%",
          },

          {
            key: "opening_stock",
            label: "Total Stock",
            width: "12%",
            render: (
              row
            ) =>
              String(
                row.opening_stock
              ),
          },

          {
            key: "rate_per_bag",
            label: "Rate / Bag",
            width: "12%",
            render: (
              row
            ) =>
              `₹ ${row.rate_per_bag}`,
          },

          {
            key: "status",
            label: "Status",
            width: "10%",
            render: (
              row
            ) => (
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${
                  row.status ===
                  "Active"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {
                  row.status
                }
              </span>
            ),
          },
{
  key: "actions",
  label: "Actions",
  width: "14%",
  render: (row) => (
    <div className="flex w-full items-center justify-start gap-2">
      {/* Edit */}
      {can("gunnybag", "edit") ? (
        <button
          type="button"
          onClick={() => openEdit(row)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-100"
        >
          Edit
        </button>
      ) : null}

      {/* Delete */}
      {can("gunnybag", "delete") ? (
        <button
          type="button"
          onClick={() => handleDelete(row)}
          className="rounded-full bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
        >
          Delete
        </button>
      ) : null}
    </div>
  ),
},

        ],
        []
      );

    /**
     * ========================================================
     * Calculate Total Branch Stock
     * ========================================================
     */
    const totalBranchStock = useMemo(() => {
      return Object.values(branchStockMap).reduce(
        (sum, stock) => sum + (Number(stock) || 0),
        0
      );
    }, [branchStockMap]);

    /**
     * ========================================================
     * Branch Wise Stock Section
     * ========================================================
     */
    const bharthiSection =
      useMemo(
        () => (
          <div className="w-full">
            {/* ==================================================
                Branch Wise Stock Display (Editable)
                ================================================== */}
            <div className="mb-4">
              <label className="mb-2 block text-[11px] font-medium text-slate-700">
                Branch Wise Stock <span className="text-rose-500">*</span>
              </label>
              {branches.length > 0 ? (
                <div className={`w-full rounded-lg border border-slate-200 ${branches.length > 2 ? 'max-h-28 overflow-y-auto' : ''}`}>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">
                          Branch
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">
                          Stock
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {branches.map((branch, index) => (
                        <tr
                          key={branch.id}
                          className={`border-b border-slate-100 last:border-b-0 ${
                            index % 2 === 0 ? "bg-white" : "bg-slate-50"
                          }`}
                        >
                          <td className="px-3 py-2 text-slate-800">
                            {branch.branch_name}
                            {branch.branch_code ? ` (${branch.branch_code})` : ""}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              value={branchStockMap[branch.id] ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                setBranchStockMap({
                                  ...branchStockMap,
                                  [branch.id]: value ? Number(value) : 0,
                                });
                              }}
                              placeholder="0"
                              className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-[#2E7D32] focus:outline-none focus:ring-1 focus:ring-[#2E7D32]"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-600">
                  No branches are available for the current organization.
                </p>
              )}
              {/* Total Branches Stock */}
              {branches.length > 0 && (
                <div className="mt-3 rounded-lg bg-[#F0F9FF] px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700">
                      Total Branches Stock
                    </span>
                    <span className="text-sm font-bold text-[#2E7D32]">
                      {totalBranchStock}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ),
        [branches, branchStockMap]
      );

    /**
     * ========================================================
     * Memoized Default Values
     * ========================================================
     */
    const modalDefaultValues =
      useMemo(
        () => ({
          code:
            editing?.code ??
            "",

          name:
            editing?.name ??
            "",

          size:
            editing?.size ??
            "",

          opening_stock:
            editing?.opening_stock ??
            0,

          rate_per_bag:
            editing?.rate_per_bag ??
            0,

          status:
            editing?.status ??
            "Active",
        }),
        [
          editing?.code,
          editing?.name,
          editing?.size,
          editing?.opening_stock,
          editing?.rate_per_bag,
          editing?.status,
        ]
      );

    /**
     * ========================================================
     * Filtered Items (Search)
     * ========================================================
     */
    const filteredItems =
      useMemo(
        () => {
          const q = search
            .toLowerCase();

          if (!q) {
            return items;
          }

          return items.filter(
            (item) =>
              String(
                item.code ?? ""
              )
                .toLowerCase()
                .includes(q) ||
              String(
                item.name ?? ""
              )
                .toLowerCase()
                .includes(q) ||
              String(
                item.size ?? ""
              )
                .toLowerCase()
                .includes(q)
          );
        },
        [items, search]
      );

    /**
     * ========================================================
     * Render
     * ========================================================
     */
    return (
      <>
        <PageHeader
          title="Gunny Bag Master"
          breadcrumb={["Masters", "Gunny Bag Master"]}
        />

        {/* ==================================================
            Main Page Container
            ================================================== */}
        <div className="relative">
          {can("gunnybag", "create") ? (
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={
                  openAdd
                }
                className="rounded-full bg-[#2E7D32] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#256427] focus:outline-none focus:ring-2 focus:ring-[#2E7D32] focus:ring-offset-2"
              >
                Add New Gunny Bag
              </button>
            </div>
          ) : null}

          {/* ==================================================
              Search
              ================================================== */}
          <SearchFilterPanel
            onSearch={setSearch}
            onClear={() =>
              setSearch("")
            }
          />

          {/* ==================================================
              Data Grid
              ================================================== */}
          <DataGrid
            loading={
              loading
            }
            columns={
              columns
            }
            data={
              filteredItems
            }
            rowKey={(
              row
            ) =>
              row.id
            }
          />
        </div>

        {/* ==================================================
            Gunny Bag Form Modal
            ================================================== */}
        <MasterFormModal
          open={
            modalOpen
          }
          title={
            editing?.id
              ? "Edit Gunny Bag"
              : "Add Gunny Bag"
          }
          fields={
            fields
          }
          defaultValues={
            modalDefaultValues
          }
          syncedValues={{ code: generatedCode || modalDefaultValues.code, opening_stock: totalBranchStock }}
          customSection={
            bharthiSection
          }
          onClose={() => {
            setModalOpen(
              false
            );

            setEditing(
              null
            );

            setGeneratedCode("");
            setSelectedBranchId("");
            setBranchStockMap({});

            clearValidationError();
          }}
          onSave={
            handleSave
          }
        />

        {/* ==================================================
            Confirm Delete
            ================================================== */}
        <ConfirmDialog
          open={
            confirmOpen
          }
          title="Delete Gunny Bag"
          description={
            selectedToDelete
              ? `Are you sure you want to delete "${selectedToDelete.name}"?`
              : ""
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={
            confirmDelete
          }
          onCancel={() => {
            setConfirmOpen(
              false
            );

            setSelectedToDelete(
              null
            );
          }}
        />
      </>
    );
  };

export default GunnyBagMasterPage;