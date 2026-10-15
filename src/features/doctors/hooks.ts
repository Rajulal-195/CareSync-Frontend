import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsApi, doctorsApi, type DoctorInput, type DoctorQuery } from '@/api/services';
import { toast } from '@/stores/toastStore';

export function useDoctors(q: DoctorQuery = {}, enabled = true) {
  return useQuery({
    queryKey: ['doctors', q],
    queryFn: ({ signal }) => doctorsApi.list(q, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: ({ signal }) => departmentsApi.list(signal),
    staleTime: 5 * 60_000,
  });
}

export function useSaveDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: DoctorInput }) =>
      id ? doctorsApi.update(id, input) : doctorsApi.create(input),
    onSuccess: (d, v) => {
      toast.success(v.id ? `Dr. ${d.name} updated.` : `Dr. ${d.name} added.`);
      qc.invalidateQueries({ queryKey: ['doctors'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
